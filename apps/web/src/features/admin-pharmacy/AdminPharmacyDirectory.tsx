import { useEffect, useMemo, useState } from "react";
import {
  adminPharmacyListResponseSchema,
  adminPharmacyResponseSchema,
  type AdminPharmacy,
} from "@wanzila/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const api = "/api/v1";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  return fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
}

function navigate(path: string) {
  window.location.assign(path);
}

function ErrorNotice({ children }: { children: string | null }) {
  return children ? (
    <p className="admin-feedback" role="alert">
      {children}
    </p>
  ) : null;
}

type Fields = {
  name: string;
  line: string;
  district: string;
  arrondissement: string;
  phone: string;
  latitude: string;
  longitude: string;
};

const emptyFields: Fields = {
  name: "",
  line: "",
  district: "",
  arrondissement: "",
  phone: "",
  latitude: "",
  longitude: "",
};

function pharmacyFields(pharmacy?: AdminPharmacy): Fields {
  return pharmacy
    ? {
        name: pharmacy.name,
        line: pharmacy.address.line,
        district: pharmacy.address.district,
        arrondissement: pharmacy.address.arrondissement,
        phone: pharmacy.phone ?? "",
        latitude: String(pharmacy.coordinates.latitude),
        longitude: String(pharmacy.coordinates.longitude),
      }
    : emptyFields;
}

function PharmacyForm({ pharmacy }: { pharmacy?: AdminPharmacy }) {
  const [fields, setFields] = useState(() => pharmacyFields(pharmacy));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update =
    (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setFields((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (
      !fields.name ||
      !fields.line ||
      !fields.district ||
      !fields.arrondissement ||
      !fields.latitude ||
      !fields.longitude
    ) {
      setError("Corrigez les champs obligatoires.");
      return;
    }
    setPending(true);
    setError(null);
    const payload = {
      name: fields.name,
      address: {
        line: fields.line,
        district: fields.district,
        arrondissement: fields.arrondissement,
      },
      ...(fields.phone ? { phone: fields.phone } : {}),
      coordinates: {
        latitude: Number(fields.latitude),
        longitude: Number(fields.longitude),
      },
    };
    const response = await request(
      pharmacy ? `/admin/pharmacies/${pharmacy.id}` : "/admin/pharmacies",
      { method: pharmacy ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
    if (!response.ok) {
      setError(
        response.status === 409
          ? "Cette pharmacie existe déjà."
          : "Corrigez les champs puis réessayez.",
      );
      setPending(false);
      return;
    }
    const saved = adminPharmacyResponseSchema.parse(await response.json()).data;
    navigate(`/admin/pharmacies/${saved.id}`);
  };
  return (
    <form
      className="pharmacy-form"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <ErrorNotice>{error}</ErrorNotice>
      <div className="form-grid">
        <label>
          <span>Nom de la pharmacie</span>
          <Input
            aria-invalid={Boolean(error && !fields.name)}
            value={fields.name}
            onChange={update("name")}
          />
        </label>
        <label>
          <span>Téléphone</span>
          <Input value={fields.phone} onChange={update("phone")} />
        </label>
        <label className="form-grid__wide">
          <span>Adresse</span>
          <Input value={fields.line} onChange={update("line")} />
        </label>
        <label>
          <span>District</span>
          <Input value={fields.district} onChange={update("district")} />
        </label>
        <label>
          <span>Arrondissement</span>
          <Input
            value={fields.arrondissement}
            onChange={update("arrondissement")}
          />
        </label>
        <label>
          <span>Latitude</span>
          <Input
            inputMode="decimal"
            value={fields.latitude}
            onChange={update("latitude")}
          />
        </label>
        <label>
          <span>Longitude</span>
          <Input
            inputMode="decimal"
            value={fields.longitude}
            onChange={update("longitude")}
          />
        </label>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pharmacy
          ? "Enregistrer les modifications"
          : "Enregistrer le brouillon"}
      </Button>
    </form>
  );
}

function PharmacyDetail({ id }: { id: string }) {
  const [pharmacy, setPharmacy] = useState<AdminPharmacy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void request(`/admin/pharmacies/${id}`)
      .then(async (response) => {
        if (response.status === 401) return navigate("/admin/connexion");
        if (!response.ok) return setError("Pharmacie introuvable.");
        setPharmacy(
          adminPharmacyResponseSchema.parse(await response.json()).data,
        );
      })
      .catch(() => setError("Impossible de charger la pharmacie."));
  }, [id]);
  const transition = async (action: "publish" | "archive") => {
    const response = await request(`/admin/pharmacies/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok)
      return setError(
        response.status === 409
          ? "Cette transition n’est plus possible."
          : "Une erreur est survenue.",
      );
    setPharmacy(adminPharmacyResponseSchema.parse(await response.json()).data);
  };
  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!pharmacy)
    return (
      <p aria-label="Chargement de la pharmacie" role="status">
        Chargement…
      </p>
    );
  return (
    <section className="pharmacy-detail">
      <div className="page-heading">
        <div>
          <p className="overline">Pharmacie</p>
          <h1>{pharmacy.name}</h1>
          <p>
            {pharmacy.address.line} · {pharmacy.address.district}
          </p>
        </div>
        <span className={`status status--${pharmacy.status.toLowerCase()}`}>
          {pharmacy.status === "PUBLISHED"
            ? "Publiée"
            : pharmacy.status === "DRAFT"
              ? "Brouillon"
              : "Archivée"}
        </span>
      </div>
      <div className="detail-actions">
        <a href={`/admin/pharmacies/${id}/modifier`}>
          <Button variant="outline">Modifier</Button>
        </a>
        {pharmacy.status === "DRAFT" && (
          <Button onClick={() => void transition("publish")}>Publier</Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Archiver</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archiver cette pharmacie ?</AlertDialogTitle>
              <AlertDialogDescription>
                Elle ne sera plus visible dans l’annuaire public.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void transition("archive")}
              >
                Archiver
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Adresse</dt>
          <dd>{pharmacy.address.line}</dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>{pharmacy.phone ?? "Non renseigné"}</dd>
        </div>
        <div>
          <dt>Coordonnées</dt>
          <dd>
            {pharmacy.coordinates.latitude}, {pharmacy.coordinates.longitude}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function AdminConnection() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await request("/admin/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setError("Identifiants invalides.");
      setPending(false);
      return;
    }
    navigate("/admin/pharmacies");
  };
  return (
    <main className="admin-connection">
      <form onSubmit={(event) => void submit(event)}>
        <p className="overline">Administration</p>
        <h1>Connexion administrateur</h1>
        <p>Accédez à la gestion de l’annuaire des pharmacies.</p>
        <ErrorNotice>{error}</ErrorNotice>
        <label>
          Adresse e-mail
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Se connecter
        </Button>
      </form>
    </main>
  );
}

export function AdminPharmacyDirectory({ pathname }: { pathname: string }) {
  const segment = pathname.split("/").filter(Boolean).at(2);
  if (segment === "nouvelle")
    return (
      <>
        <div className="page-heading">
          <div>
            <p className="overline">Pharmacies</p>
            <h1>Nouvelle pharmacie</h1>
          </div>
        </div>
        <PharmacyForm />
      </>
    );
  if (segment && segment !== "modifier") return <PharmacyDetail id={segment} />;
  const [data, setData] = useState<AdminPharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    name: "",
    district: "",
    arrondissement: "",
    status: "",
    page: 1,
    pageSize: 20,
  });
  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    });
    if (filters.name) params.set("name", filters.name);
    if (filters.district) params.set("district", filters.district);
    if (filters.arrondissement)
      params.set("arrondissement", filters.arrondissement);
    if (filters.status) params.set("status", filters.status);
    return params.toString();
  }, [filters]);
  useEffect(() => {
    setLoading(true);
    setError(null);
    void request(`/admin/pharmacies?${query}`)
      .then(async (response) => {
        if (response.status === 401) return navigate("/admin/connexion");
        if (!response.ok) {
          setError(
            response.status === 403
              ? "Vous n’avez pas l’autorisation requise."
              : "Impossible de charger les pharmacies. Réessayez.",
          );
          return;
        }
        setData(
          adminPharmacyListResponseSchema.parse(await response.json()).data,
        );
      })
      .catch(() => setError("Impossible de charger les pharmacies. Réessayez."))
      .finally(() => setLoading(false));
  }, [query]);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="overline">Annuaire</p>
          <h1>Pharmacies</h1>
          <p>Gérez les informations et la publication de l’annuaire.</p>
        </div>
        <a href="/admin/pharmacies/nouvelle">
          <Button>Ajouter une pharmacie</Button>
        </a>
      </div>
      <div className="pharmacy-filters">
        <label>
          Filtrer par nom
          <Input
            value={filters.name}
            onChange={(event) =>
              setFilters((old) => ({
                ...old,
                name: event.target.value,
                page: 1,
              }))
            }
          />
        </label>
        <label>
          District
          <Input
            value={filters.district}
            onChange={(event) =>
              setFilters((old) => ({
                ...old,
                district: event.target.value,
                page: 1,
              }))
            }
          />
        </label>
        <label>
          Arrondissement
          <Input
            value={filters.arrondissement}
            onChange={(event) =>
              setFilters((old) => ({
                ...old,
                arrondissement: event.target.value,
                page: 1,
              }))
            }
          />
        </label>
        <label>
          Statut
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((old) => ({
                ...old,
                status: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Tous</option>
            <option value="DRAFT">Brouillon</option>
            <option value="PUBLISHED">Publiée</option>
            <option value="ARCHIVED">Archivée</option>
          </select>
        </label>
        <label>
          Résultats par page
          <select
            value={filters.pageSize}
            onChange={(event) =>
              setFilters((old) => ({
                ...old,
                pageSize: Number(event.target.value),
                page: 1,
              }))
            }
          >
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p aria-label="Chargement des pharmacies" role="status">
          Chargement…
        </p>
      ) : (
        <ErrorNotice>{error}</ErrorNotice>
      )}
      {!loading &&
        !error &&
        (data.length ? (
          <div className="pharmacy-list">
            {data.map((item) => (
              <a href={`/admin/pharmacies/${item.id}`} key={item.id}>
                <strong>{item.name}</strong>
                <span>
                  {item.address.district} · {item.status}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p>Aucune pharmacie à afficher</p>
        ))}
    </section>
  );
}
