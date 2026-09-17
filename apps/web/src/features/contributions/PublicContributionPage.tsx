import {
  ArrowLeft,
  LocateFixed,
  MapPin,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContributionMap, type ProposedCoordinates } from "./ContributionMap";
import "./contributions.css";

type SubmissionState = "idle" | "sending" | "done" | "error";
type Fields = {
  name: string;
  phone: string;
  line: string;
  district: string;
  arrondissement: string;
  note: string;
};

const emptyFields: Fields = {
  name: "",
  phone: "",
  line: "",
  district: "",
  arrondissement: "",
  note: "",
};

function newSubmissionId(): string {
  return crypto.randomUUID();
}

export function PublicContributionPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [mapCenter, setMapCenter] = useState<ProposedCoordinates | null>(null);
  const [focusCoordinates, setFocusCoordinates] =
    useState<ProposedCoordinates | null>(null);
  const [coordinates, setCoordinates] = useState<ProposedCoordinates | null>(
    null,
  );
  const [manualLocation, setManualLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);
  const [submission, setSubmission] = useState<SubmissionState>("idle");
  const [submitError, setSubmitError] = useState("");

  const onCenterChange = useCallback((value: ProposedCoordinates) => {
    setMapCenter(value);
    setCoordinates(null);
  }, []);

  function useMyPosition() {
    if (!navigator.geolocation) {
      setLocationMessage(
        "Position indisponible sur ce navigateur. L’adresse suffit pour proposer une pharmacie.",
      );
      return;
    }
    setLocationMessage("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(accuracy) || accuracy > 100) {
          setLocationMessage(
            "Position trop imprécise. Déplacez la carte ou continuez avec l’adresse seule.",
          );
          return;
        }
        const point = { latitude, longitude };
        setFocusCoordinates(point);
        setCoordinates(null);
        setManualLocation(false);
        setLocationMessage(
          "Position trouvée. Vérifiez le repère, puis choisissez ce point pour continuer.",
        );
      },
      () =>
        setLocationMessage(
          "Position refusée ou indisponible. Vous pouvez utiliser la carte ou l’adresse seule.",
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  function selectMapCenter() {
    if (!mapCenter) {
      setLocationMessage("Déplacez d’abord la carte vers la pharmacie.");
      return;
    }
    setCoordinates(mapCenter);
    setManualLocation(false);
    setSubmissionId(newSubmissionId());
    setLocationMessage("Repère sélectionné. Vous pouvez continuer.");
  }

  function changeField(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setSubmissionId(newSubmissionId());
    setSubmission("idle");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission === "sending") return;
    setSubmission("sending");
    setSubmitError("");
    try {
      const response = await fetch("/api/v1/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId,
          name: fields.name.trim(),
          address: {
            line: fields.line.trim(),
            district: fields.district.trim(),
            arrondissement: fields.arrondissement.trim(),
          },
          ...(fields.phone.trim() ? { phone: fields.phone.trim() } : {}),
          ...(coordinates ? { coordinates } : {}),
          ...(fields.note.trim() ? { note: fields.note.trim() } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Trop de propositions ont été envoyées depuis cette connexion. Réessayez plus tard."
            : response.status === 400
              ? "Vérifiez les champs du formulaire."
              : response.status === 409
                ? "La proposition a changé pendant l’envoi. Réessayez."
                : "Envoi impossible. Réessayez dans un instant.",
        );
      }
      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("status" in payload) ||
        payload.status !== "PENDING"
      ) {
        throw new Error("Réponse inattendue. Réessayez dans un instant.");
      }
      setSubmission("done");
    } catch (error) {
      setSubmission("error");
      setSubmitError(
        error instanceof Error ? error.message : "Envoi impossible.",
      );
    }
  }

  return (
    <main className="contribution-page" id="public-content">
      <div className="contribution-page__heading">
        {step === 2 && submission !== "done" ? (
          <Button
            aria-label="Revenir à la localisation"
            onClick={() => setStep(1)}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : (
          <a aria-label="Revenir à la carte" href="/">
            ←
          </a>
        )}
        <div>
          <p className="overline">Proposer une pharmacie</p>
          <h1>Ajouter une pharmacie</h1>
        </div>
      </div>
      {submission === "done" ? (
        <section
          className="contribution-card contribution-confirmation"
          role="status"
        >
          <ShieldCheck aria-hidden="true" />
          <h2>Proposition reçue</h2>
          <p>
            Elle est en attente de vérification par l’équipe d’administration.
            Elle n’est pas encore publiée.
          </p>
          <a href="/">Revenir à la carte</a>
        </section>
      ) : step === 1 ? (
        <>
          <section
            className="contribution-location"
            aria-labelledby="contribution-step-title"
          >
            <div className="contribution-location__map">
              <ContributionMap
                focusCoordinates={focusCoordinates}
                onCenterChange={onCenterChange}
              />
            </div>
            <div className="contribution-card contribution-location__panel">
              <p className="contribution-step">Étape 1 sur 2</p>
              <h2 id="contribution-step-title">Où se trouve la pharmacie ?</h2>
              <p>
                Déplacez la carte pour placer le repère au centre, ou utilisez
                votre position si vous êtes devant la pharmacie.
              </p>
              <div className="contribution-actions">
                <Button onClick={useMyPosition} type="button" variant="outline">
                  <LocateFixed aria-hidden="true" /> Utiliser ma position
                </Button>
                <Button
                  onClick={selectMapCenter}
                  type="button"
                  variant="outline"
                >
                  <MapPin aria-hidden="true" /> Choisir ce point
                </Button>
              </div>
              <Button
                className="contribution-manual"
                onClick={() => {
                  setCoordinates(null);
                  setManualLocation(true);
                  setSubmissionId(newSubmissionId());
                  setLocationMessage(
                    "L’adresse sera vérifiée par l’équipe avant publication.",
                  );
                }}
                type="button"
                variant="link"
              >
                Continuer avec l’adresse seule
              </Button>
              {locationMessage && (
                <p className="contribution-message" role="status">
                  {locationMessage}
                </p>
              )}
              <p className="contribution-privacy">
                Votre position est demandée uniquement si vous choisissez «
                Utiliser ma position ». Vous pouvez proposer une pharmacie sans
                autoriser le GPS.
              </p>
              <Button
                disabled={!coordinates && !manualLocation}
                onClick={() => setStep(2)}
                type="button"
              >
                Continuer
              </Button>
            </div>
          </section>
        </>
      ) : (
        <section
          className="contribution-card contribution-form-section"
          aria-labelledby="contribution-form-title"
        >
          <p className="contribution-step">Étape 2 sur 2</p>
          <h2 id="contribution-form-title">Décrire la pharmacie</h2>
          <p>
            {coordinates
              ? "Le repère choisi sera transmis avec la proposition."
              : "Sans repère, indiquez une adresse suffisamment précise pour la retrouver."}
          </p>
          <form
            className="contribution-form"
            onSubmit={(event) => void submit(event)}
          >
            <div>
              <Label htmlFor="contribution-name">Nom de la pharmacie *</Label>
              <Input
                autoComplete="organization"
                id="contribution-name"
                maxLength={180}
                onChange={(event) => changeField("name", event.target.value)}
                required
                value={fields.name}
              />
            </div>
            <div>
              <Label htmlFor="contribution-phone">Téléphone (facultatif)</Label>
              <Input
                autoComplete="tel"
                id="contribution-phone"
                inputMode="tel"
                maxLength={32}
                onChange={(event) => changeField("phone", event.target.value)}
                pattern="\+?[0-9][0-9 .()\-]{5,31}"
                type="tel"
                value={fields.phone}
              />
            </div>
            <div>
              <Label htmlFor="contribution-address">
                Adresse ou indication *
              </Label>
              <Input
                autoComplete="street-address"
                id="contribution-address"
                maxLength={255}
                onChange={(event) => changeField("line", event.target.value)}
                required
                value={fields.line}
              />
            </div>
            <div className="contribution-form__row">
              <div>
                <Label htmlFor="contribution-district">Quartier *</Label>
                <Input
                  id="contribution-district"
                  maxLength={120}
                  onChange={(event) =>
                    changeField("district", event.target.value)
                  }
                  required
                  value={fields.district}
                />
              </div>
              <div>
                <Label htmlFor="contribution-arrondissement">
                  Arrondissement *
                </Label>
                <Input
                  id="contribution-arrondissement"
                  maxLength={120}
                  onChange={(event) =>
                    changeField("arrondissement", event.target.value)
                  }
                  required
                  value={fields.arrondissement}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="contribution-note">
                Note complémentaire (facultative)
              </Label>
              <textarea
                id="contribution-note"
                maxLength={200}
                onChange={(event) => changeField("note", event.target.value)}
                value={fields.note}
              />
              <small>{fields.note.length}/200</small>
            </div>
            {submitError && <p role="alert">{submitError}</p>}
            <Button disabled={submission === "sending"} type="submit">
              <Send aria-hidden="true" />{" "}
              {submission === "sending" ? "Envoi…" : "Soumettre la proposition"}
            </Button>
          </form>
          <p className="contribution-privacy">
            <ShieldCheck aria-hidden="true" /> Votre proposition sera vérifiée
            avant publication. La note libre est supprimée au plus tard après 90
            jours.
          </p>
        </section>
      )}
    </main>
  );
}
