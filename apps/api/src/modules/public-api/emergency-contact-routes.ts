import type { EmergencyContactsResponse } from "@wanzila/contracts";
import type { FastifyInstance } from "fastify";
import type { ApiPrismaClient } from "../../infrastructure/prisma.js";

export function registerEmergencyContactRoutes(
  app: FastifyInstance,
  prisma: ApiPrismaClient,
): void {
  app.get(
    "/emergency-contacts",
    async (): Promise<EmergencyContactsResponse> => {
      const contacts = await prisma.emergencyContact.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          label: true,
          phone: true,
          position: true,
          updatedAt: true,
        },
      });

      return {
        data: contacts.map((contact) => ({
          ...contact,
          updatedAt: contact.updatedAt.toISOString(),
        })),
      };
    },
  );
}
