import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { envs } from '../config/envs';
import { UserRole } from '../common';

@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async system() {
    const [users, matches, registrations, invites] = await Promise.all([
      this.prisma.user.findMany({ select: { roles: true, status: true } }),
      this.prisma.match.findMany({ select: { status: true } }),
      this.prisma.matchRegistration.count(),
      this.prisma.matchInvite.count(),
    ]);

    const roleCounts: Record<string, number> = {
      [UserRole.DEVELOPER]: 0,
      [UserRole.ADMIN]: 0,
      [UserRole.USUARIO]: 0,
    };
    let active = 0;
    for (const u of users) {
      if (u.status !== 'eliminado') active++;
      for (const r of u.roles) {
        if (roleCounts[r] != null) roleCounts[r]++;
      }
    }

    const matchesByStatus = matches.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      environment: envs.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      mailConfigured: this.mail.isConfigured,
      totals: {
        users: users.length,
        activeUsers: active,
        matches: matches.length,
        registrations,
        invites,
      },
      roleCounts,
      matchesByStatus,
    };
  }
}
