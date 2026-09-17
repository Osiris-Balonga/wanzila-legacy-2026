import type { AdminPharmacy } from "@wanzila/contracts";
import { MoreHorizontal, Phone, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PharmacyPhoto } from "@/components/PharmacyPhoto";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusLabel(status: AdminPharmacy["status"]): string {
  if (status === "PUBLISHED") return "Publiée";
  if (status === "DRAFT") return "Brouillon";
  return "Archivée";
}

function PharmacyStatus({ status }: { status: AdminPharmacy["status"] }) {
  return (
    <Badge
      className={`pharmacy-status pharmacy-status--${status.toLowerCase()}`}
      variant="secondary"
    >
      {statusLabel(status)}
    </Badge>
  );
}

export function AdminPharmacyList({
  pharmacies,
  total,
}: {
  pharmacies: AdminPharmacy[];
  total: number;
}) {
  return (
    <section
      aria-label="Liste des pharmacies"
      className="pharmacy-directory-list"
    >
      <header className="pharmacy-directory-list__heading">
        <strong>
          {total} pharmacie{total > 1 ? "s" : ""}
        </strong>
      </header>
      <div className="pharmacy-directory-list__desktop">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Quartier</TableHead>
              <TableHead>Arrondissement</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Dernière mise à jour</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pharmacies.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <span className="pharmacy-directory-list__identity">
                    <PharmacyPhoto
                      className="pharmacy-directory-list__photo"
                      decorative
                      fallback={<Store />}
                      name={item.name}
                      photo={item.photo}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <span className="pharmacy-directory-list__subline">
                        {item.address.line}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>{item.address.district}</TableCell>
                <TableCell>{item.address.arrondissement}</TableCell>
                <TableCell>
                  {item.phone ? (
                    <span className="pharmacy-directory-list__phone">
                      <Phone aria-hidden="true" /> {item.phone}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <span className="pharmacy-directory-list__source">
                    {item.recordProvenance?.source ?? "Non renseignée"}
                  </span>
                </TableCell>
                <TableCell>
                  <time dateTime={item.updatedAt}>
                    {new Intl.DateTimeFormat("fr-CG", {
                      dateStyle: "medium",
                    }).format(new Date(item.updatedAt))}
                  </time>
                </TableCell>
                <TableCell>
                  <PharmacyStatus status={item.status} />
                </TableCell>
                <TableCell>
                  <span className="pharmacy-directory-list__actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Actions pour ${item.name}`}
                          size="icon"
                          variant="outline"
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/admin/pharmacies/${item.id}`}>
                            Voir <span className="sr-only">{item.name}</span>
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/admin/pharmacies/${item.id}/modifier`}>
                            Modifier{" "}
                            <span className="sr-only">{item.name}</span>
                          </a>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="pharmacy-directory-list__mobile">
        {pharmacies.map((item) => (
          <a
            className="pharmacy-directory-card"
            href={`/admin/pharmacies/${item.id}`}
            key={item.id}
          >
            <span className="pharmacy-directory-card__top">
              <strong>{item.name}</strong>
              <PharmacyStatus status={item.status} />
            </span>
            <span>{item.address.line}</span>
            <span>
              {item.address.district} · {item.address.arrondissement}
            </span>
            <span className="pharmacy-directory-card__action">
              Voir la fiche →
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
