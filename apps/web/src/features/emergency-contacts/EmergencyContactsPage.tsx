import type { EmergencyContact } from "@wanzila/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import "./emergency-contacts.css";

export type EmergencyContactsPageState =
  | { kind: "loading" }
  | { kind: "success"; contacts: EmergencyContact[] }
  | { kind: "empty" }
  | { kind: "offline" }
  | { kind: "invalid-response" }
  | { kind: "api-error" };

type EmergencyContactsPageProps = {
  state: EmergencyContactsPageState;
  onRetry?: () => void;
};

function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat("fr-CG", {
    dateStyle: "long",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(updatedAt));
}

function StatusMessage({
  title,
  children,
  onRetry,
}: {
  title: string;
  children: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <section
      aria-live="polite"
      className="emergency-contacts__state"
      role="status"
    >
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
        {onRetry ? (
          <Button
            className="emergency-contacts__retry"
            onClick={onRetry}
            size="lg"
          >
            Réessayer
          </Button>
        ) : null}
      </Alert>
    </section>
  );
}

function ContactCard({ contact }: { contact: EmergencyContact }) {
  const timeAttributes = { datetime: contact.updatedAt };

  return (
    <article className="emergency-contact-card">
      <Card>
        <CardHeader>
          <Badge variant="secondary">Contact d’urgence</Badge>
          <CardTitle>{contact.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="emergency-contact-card__number">{contact.phone}</p>
        </CardContent>
        <CardFooter className="emergency-contact-card__footer">
          <a
            aria-label={`Appeler ${contact.label} au ${contact.phone}`}
            className="emergency-call-action"
            href={`tel:${contact.phone}`}
          >
            Appeler
          </a>
          <time {...timeAttributes}>
            Mis à jour le {formatUpdatedAt(contact.updatedAt)}
          </time>
        </CardFooter>
      </Card>
    </article>
  );
}

export function EmergencyContactsPage({
  state,
  onRetry,
}: EmergencyContactsPageProps) {
  return (
    <section
      aria-labelledby="emergency-contacts-title"
      className="emergency-contacts"
    >
      <header className="emergency-contacts__heading">
        <p className="overline">Informations utiles</p>
        <h1 id="emergency-contacts-title">Contacts d’urgence</h1>
        <p>Choisissez un numéro ci-dessous pour lancer vous-même l’appel.</p>
      </header>

      <Alert className="emergency-contacts__disclaimer">
        <AlertTitle>À savoir</AlertTitle>
        <AlertDescription>
          Cette information ne remplace pas les services d’urgence et ne
          garantit ni disponibilité ni réponse.
        </AlertDescription>
      </Alert>

      <Separator />

      {state.kind === "loading" ? (
        <section
          aria-busy="true"
          aria-live="polite"
          className="emergency-contacts__loading"
          role="status"
        >
          <span className="sr-only">Chargement des contacts d’urgence</span>
          <Skeleton className="emergency-contacts__skeleton" />
          <Skeleton className="emergency-contacts__skeleton" />
        </section>
      ) : null}

      {state.kind === "success" ? (
        <section
          aria-label="Numéros d’urgence"
          className="emergency-contacts__list"
        >
          {state.contacts.map((contact) => (
            <ContactCard contact={contact} key={contact.id} />
          ))}
        </section>
      ) : null}

      {state.kind === "empty" ? (
        <StatusMessage title="Aucun contact d’urgence n’est disponible">
          Revenez plus tard ou utilisez les services d’urgence habituels si vous
          avez besoin d’aide immédiate.
        </StatusMessage>
      ) : null}

      {state.kind === "offline" ? (
        <StatusMessage
          onRetry={onRetry}
          title="Impossible de joindre le service"
        >
          Vérifiez votre connexion, puis réessayez. Cette page ne remplace pas
          une aide professionnelle.
        </StatusMessage>
      ) : null}

      {state.kind === "api-error" ? (
        <StatusMessage
          onRetry={onRetry}
          title="Les contacts d’urgence sont indisponibles"
        >
          Réessayez dans un instant. La disponibilité ou la réponse des services
          ne peut pas être garantie.
        </StatusMessage>
      ) : null}

      {state.kind === "invalid-response" ? (
        <StatusMessage
          onRetry={onRetry}
          title="Les contacts d’urgence sont indisponibles"
        >
          Les informations reçues ne sont pas exploitables. Réessayez dans un
          instant.
        </StatusMessage>
      ) : null}
    </section>
  );
}
