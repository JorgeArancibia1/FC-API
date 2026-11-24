// Inicializa el replica set local rs0 hablando el protocolo wire de MongoDB (OP_MSG),
// sin depender de mongosh ni de que Prisma pueda conectarse (el nodo inicia como RsGhost).
const net = require('net');

const HOST = '127.0.0.1';
const PORT = 27017;

// ---------- BSON mínimo (solo tipos necesarios) ----------
function cstring(s) {
  return Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
}

function bsonDoc(obj) {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      entries.push(Buffer.concat([Buffer.from([0x0a]), cstring(key)]));
    } else if (typeof value === 'number') {
      const b = Buffer.alloc(4);
      b.writeInt32LE(value, 0);
      entries.push(Buffer.concat([Buffer.from([0x10]), cstring(key), b]));
    } else if (typeof value === 'string') {
      const strBuf = Buffer.from(value, 'utf8');
      const len = Buffer.alloc(4);
      len.writeInt32LE(strBuf.length + 1, 0);
      entries.push(Buffer.concat([Buffer.from([0x02]), cstring(key), len, strBuf, Buffer.from([0])]));
    } else if (Array.isArray(value)) {
      const arrObj = {};
      value.forEach((v, i) => (arrObj[i] = v));
      const inner = bsonDoc(arrObj);
      entries.push(Buffer.concat([Buffer.from([0x04]), cstring(key), inner]));
    } else if (typeof value === 'object') {
      entries.push(Buffer.concat([Buffer.from([0x03]), cstring(key), bsonDoc(value)]));
    }
  }
  const body = Buffer.concat(entries);
  const out = Buffer.alloc(4 + body.length + 1);
  out.writeInt32LE(out.length, 0);
  body.copy(out, 4);
  out[out.length - 1] = 0;
  return out;
}

// Decodificador mínimo para leer la respuesta (ok, errmsg, etc.)
function readBson(buf, offset = 0) {
  const size = buf.readInt32LE(offset);
  const end = offset + size - 1;
  let pos = offset + 4;
  const out = {};
  while (pos < end) {
    const type = buf[pos++];
    const nameEnd = buf.indexOf(0, pos);
    const name = buf.toString('utf8', pos, nameEnd);
    pos = nameEnd + 1;
    switch (type) {
      case 0x01: out[name] = buf.readDoubleLE(pos); pos += 8; break;
      case 0x02: {
        const l = buf.readInt32LE(pos);
        out[name] = buf.toString('utf8', pos + 4, pos + 4 + l - 1);
        pos += l;
        break;
      }
      case 0x03: {
        const r = readBson(buf, pos);
        out[name] = r.value;
        pos = r.next;
        break;
      }
      case 0x04: {
        const r = readBson(buf, pos);
        out[name] = Object.values(r.value);
        pos = r.next;
        break;
      }
      case 0x05: {
        const len = buf.readInt32LE(pos);
        pos += 4 + 1 + len; // int32 len + byte subtype + datos
        out[name] = '<binary>';
        break;
      }
      case 0x07: out[name] = buf.toString('hex', pos, pos + 12); pos += 12; break;
      case 0x08: out[name] = buf[pos] === 1; pos += 1; break;
      case 0x09: out[name] = new Date(Number(buf.readBigInt64LE(pos))); pos += 8; break;
      case 0x0a: out[name] = null; break;
      case 0x10: out[name] = buf.readInt32LE(pos); pos += 4; break;
      case 0x11: out[name] = `ts(${buf.readUInt32LE(pos + 4)},${buf.readUInt32LE(pos)})`; pos += 8; break;
      case 0x12: out[name] = buf.readBigInt64LE(pos); pos += 8; break;
      case 0x13: pos += 16; out[name] = '<decimal128>'; break;
      default:
        throw new Error(`BSON type 0x${type.toString(16)} no soportado en decoder (campo ${name})`);
    }
  }
  return { value: out, next: end + 1 };
}

function opMsg(doc) {
  const body = bsonDoc(doc);
  const header = Buffer.alloc(21);
  header.writeInt32LE(21 + body.length, 0); // messageLength
  header.writeInt32LE(1, 4); // requestID
  header.writeInt32LE(0, 8); // responseTo
  header.writeInt32LE(2013, 12); // opCode = OP_MSG
  header.writeInt32LE(0, 16); // flagBits
  header[20] = 0; // section kind 0
  return Buffer.concat([header, body]);
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, HOST);
    let buf = Buffer.alloc(0);
    // Todo comando OP_MSG contra la administracción necesita $db: "admin"
    const payload = { ...cmd, $db: 'admin' };
    sock.on('connect', () => sock.write(opMsg(payload)));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 4) return;
      const msgLen = buf.readInt32LE(0);
      if (buf.length < msgLen) return;
      try {
        // header(16) + flagBits(4) + kind(1) = 21
        const { value } = readBson(buf, 21);
        resolve(value);
      } catch (e) {
        reject(e);
      } finally {
        sock.end();
      }
    });
    sock.on('error', reject);
  });
}

(async () => {
  // 1. ¿Ya existe el replica set?
  try {
    const status = await runCommand({ replSetGetStatus: 1 });
    if (status.ok === 1) {
      console.log('replica set ya inicializado, myState:', status.myState);
      process.exit(0);
    }
  } catch (e) {
    // no inicializado, seguimos
  }

  // 2. Inicializar
  const res = await runCommand({
    replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `${HOST}:${PORT}` }] },
  });
  console.log('replSetInitiate =>', JSON.stringify(res, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  // 3. Esperar a que el nodo sea PRIMARY (myState = 1)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const s = await runCommand({ replSetGetStatus: 1 });
      if (s.ok === 1 && s.myState === 1) {
        console.log('rs0 en PRIMARY. Listo.');
        process.exit(0);
      }
      console.log(`esperando PRIMARY... myState=${s.myState}`);
    } catch {
      console.log('esperando PRIMARY... (sin respuesta aun)');
    }
  }
  console.log('Timeout esperando PRIMARY');
  process.exit(1);
})();
