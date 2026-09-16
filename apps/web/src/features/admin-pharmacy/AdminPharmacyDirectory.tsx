import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Plus } from "lucide-react";
import {
  adminPharmacyListResponseSchema,
  adminPharmacyResponseSchema,
  createAdminPharmacyRequestSchema,
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
import { AdminPharmacyList } from "./AdminPharmacyList";

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
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Fields, string>>
  >({});
  const fieldMessage = (key: keyof Fields) =>
    fieldErrors[key] ? (
      <small id={`${key}-error`} className="pharmacy-form__error">
        {fieldErrors[key]}
      </small>
    ) : null;
  const update =
    (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFields((old) => ({ ...old, [key]: event.target.value }));
      setFieldErrors((old) => ({ ...old, [key]: undefined }));
    };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const payload = {
      name: fields.name,
      address: {
        line: fields.line,
        district: fields.district,
        arrondissement: fields.arrondissement,
      },
      ...(fields.phone.trim() ? { phone: fields.phone } : {}),
      coordinates: {
        latitude: fields.latitude.trim() === "" ? NaN : Number(fields.latitude),
        longitude:
          fields.longitude.trim() === "" ? NaN : Number(fields.longitude),
      },
    };
    const validated = createAdminPharmacyRequestSchema.safeParse(payload);
    if (!validated.success) {
      const nextErrors: Partial<Record<keyof Fields, string>> = {};
      for (const issue of validated.error.issues) {
        const key = (
          issue.path[0] === "address" || issue.path[0] === "coordinates"
            ? issue.path[1]
            : issue.path[0]
        ) as keyof Fields | undefined;
        if (key && !nextErrors[key]) {
          nextErrors[key] =
            key === "phone"
              ? "Saisissez un numéro de téléphone valide."
              : key === "latitude" || key === "longitude"
                ? "Saisissez une coordonnée valide."
                : "Ce champ est obligatoire ou dépasse la longueur autorisée.";
        }
      }
      setFieldErrors(nextErrors);
      setError("Corrigez les champs indiqués avant d’enregistrer.");
      return;
    }
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await request(
        pharmacy ? `/admin/pharmacies/${pharmacy.id}` : "/admin/pharmacies",
        {
          method: pharmacy ? "PATCH" : "POST",
          body: JSON.stringify({
            ...validated.data,
            ...(pharmacy && !fields.phone.trim() ? { phone: null } : {}),
          }),
        },
      );
      if (response.status === 401) {
        navigate("/admin/connexion");
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 409
            ? "Cette pharmacie existe déjà."
            : response.status === 403
              ? "Vous n’avez pas l’autorisation requise."
              : "Impossible d’enregistrer la pharmacie. Réessayez.",
        );
        return;
      }
      const result = adminPharmacyResponseSchema.safeParse(
        await response.json(),
      );
      if (!result.success) throw new Error("Invalid pharmacy response");
      navigate(`/admin/pharmacies/${result.data.data.id}`);
    } catch {
      setError("Impossible d’enregistrer la pharmacie. Réessayez.");
    } finally {
      setPending(false);
    }
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
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            value={fields.name}
            onChange={update("name")}
          />
          {fieldMessage("name")}
        </label>
        <label>
          <span>Téléphone</span>
          <Input
            type="tel"
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            value={fields.phone}
            onChange={update("phone")}
          />
          {fieldMessage("phone")}
        </label>
        <label className="form-grid__wide">
          <span>Adresse</span>
          <Input
            aria-invalid={Boolean(fieldErrors.line)}
            aria-describedby={fieldErrors.line ? "line-error" : undefined}
            value={fields.line}
            onChange={update("line")}
          />
          {fieldMessage("line")}
        </label>
        <label>
          <span>District</span>
          <Input
            aria-invalid={Boolean(fieldErrors.district)}
            aria-describedby={
              fieldErrors.district ? "district-error" : undefined
            }
            value={fields.district}
            onChange={update("district")}
          />
          {fieldMessage("district")}
        </label>
        <label>
          <span>Arrondissement</span>
          <Input
            aria-invalid={Boolean(fieldErrors.arrondissement)}
            aria-describedby={
              fieldErrors.arrondissement ? "arrondissement-error" : undefined
            }
            value={fields.arrondissement}
            onChange={update("arrondissement")}
          />
          {fieldMessage("arrondissement")}
        </label>
        <label>
          <span>Latitude</span>
          <Input
            aria-invalid={Boolean(fieldErrors.latitude)}
            aria-describedby={
              fieldErrors.latitude ? "latitude-error" : undefined
            }
            inputMode="decimal"
            value={fields.latitude}
            onChange={update("latitude")}
          />
          {fieldMessage("latitude")}
        </label>
        <label>
          <span>Longitude</span>
          <Input
            aria-invalid={Boolean(fieldErrors.longitude)}
            aria-describedby={
              fieldErrors.longitude ? "longitude-error" : undefined
            }
            inputMode="decimal"
            value={fields.longitude}
            onChange={update("longitude")}
          />
          {fieldMessage("longitude")}
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
    try {
      const response = await request(`/admin/pharmacies/${id}/${action}`, {
        method: "POST",
      });
      if (response.status === 401) return navigate("/admin/connexion");
      if (!response.ok)
        return setError(
          response.status === 409
            ? "Cette transition n’est plus possible."
            : "Une erreur est survenue.",
        );
      setPharmacy(
        adminPharmacyResponseSchema.parse(await response.json()).data,
      );
    } catch {
      setError("Impossible de modifier le statut. Réessayez.");
    }
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
      <a className="pharmacy-detail__back" href="/admin/pharmacies">
        ← Retour aux pharmacies
      </a>
      <div className="page-heading">
        <div>
          <p className="overline">Fiche pharmacie</p>
          <h1>{pharmacy.name}</h1>
          <p>Détails et informations de la pharmacie.</p>
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
        <Button asChild variant="outline">
          <a href={`/admin/pharmacies/${id}/modifier`}>Modifier</a>
        </Button>
        {pharmacy.status === "DRAFT" && (
          <Button onClick={() => void transition("publish")}>Publier</Button>
        )}
        {pharmacy.status !== "ARCHIVED" && (
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
        )}
      </div>
      <h2>Informations</h2>
      <dl className="detail-grid">
        <div>
          <dt>Nom</dt>
          <dd>{pharmacy.name}</dd>
        </div>
        <div>
          <dt>Adresse</dt>
          <dd>{pharmacy.address.line}</dd>
        </div>
        <div>
          <dt>Quartier</dt>
          <dd>{pharmacy.address.district}</dd>
        </div>
        <div>
          <dt>Arrondissement</dt>
          <dd>{pharmacy.address.arrondissement}</dd>
        </div>
        <div>
          <dt>Téléphone</dt>
          <dd>
            {pharmacy.phone ? (
              <a href={`tel:${pharmacy.phone.replace(/[^+\d]/g, "")}`}>
                {pharmacy.phone}
              </a>
            ) : (
              "Non renseigné"
            )}
          </dd>
        </div>
        <div>
          <dt>Coordonnées</dt>
          <dd>
            {pharmacy.coordinates.latitude}, {pharmacy.coordinates.longitude}
          </dd>
        </div>
        <div>
          <dt>Dernière modification</dt>
          <dd>{new Date(pharmacy.updatedAt).toLocaleDateString("fr-CG")}</dd>
        </div>
      </dl>
    </section>
  );
}

function PharmacyEdit({ id }: { id: string }) {
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
  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!pharmacy) return <p role="status">Chargement…</p>;
  return (
    <section>
      <h1>Modifier la pharmacie</h1>
      <PharmacyForm pharmacy={pharmacy} />
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
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await request("/admin/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError("Identifiants invalides.");
        return;
      }
      navigate("/admin/pharmacies");
    } catch {
      setError("Connexion indisponible. Réessayez.");
    } finally {
      setPending(false);
    }
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
  const editId = pathname.match(
    /^\/admin\/pharmacies\/([^/]+)\/modifier\/?$/,
  )?.[1];
  if (editId) return <PharmacyEdit id={editId} />;
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
  return <PharmacyDirectoryList />;
}

function PharmacyDirectoryList() {
  const [data, setData] = useState<AdminPharmacy[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [refresh, setRefresh] = useState(0);
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
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(appliedFilters.page),
      pageSize: String(appliedFilters.pageSize),
    });
    if (appliedFilters.name) params.set("name", appliedFilters.name);
    if (appliedFilters.district)
      params.set("district", appliedFilters.district);
    if (appliedFilters.arrondissement)
      params.set("arrondissement", appliedFilters.arrondissement);
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    return params.toString();
  }, [appliedFilters]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void request(`/admin/pharmacies?${query}`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) return navigate("/admin/connexion");
        if (!response.ok) {
          setError(
            response.status === 403
              ? "Vous n’avez pas l’autorisation requise."
              : "Impossible de charger les pharmacies. Vous pouvez réessayer.",
          );
          return;
        }
        const result = adminPharmacyListResponseSchema.parse(
          await response.json(),
        );
        if (!active) return;
        setData(result.data);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      })
      .catch(() => {
        if (active)
          setError(
            "Impossible de charger les pharmacies. Vous pouvez réessayer.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, refresh]);
  return (
    <section className="admin-pharmacy-directory">
      <div className="page-heading">
        <div>
          <h1>Pharmacies</h1>
          <p>
            Gérez la liste des pharmacies de Brazzaville, leurs informations et
            leur statut.
          </p>
        </div>
        <Button
          disabled
          variant="outline"
          title="Filtre de période indisponible"
        >
          <CalendarDays aria-hidden="true" /> Période indisponible
        </Button>
      </div>
      <div className="pharmacy-directory-toolbar">
        <div className="pharmacy-filters">
          <label className="pharmacy-filters__search">
            <span className="sr-only">Rechercher une pharmacie</span>
            <Input
              type="search"
              placeholder="Rechercher une pharmacie, un quartier, un téléphone..."
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
            Arrondissement
            <Input
              list="admin-arrondissements"
              placeholder="Tous les arrondissements"
              value={filters.arrondissement}
              onChange={(event) =>
                setFilters((old) => ({
                  ...old,
                  arrondissement: event.target.value,
                  page: 1,
                }))
              }
            />
            <datalist id="admin-arrondissements">
              <option value="Bacongo" />
              <option value="Moungali" />
              <option value="Poto-Poto" />
            </datalist>
          </label>
          <label>
            Source
            <select disabled title="Filtre source indisponible">
              <option>Sources indisponibles</option>
            </select>
          </label>
          <Button
            className="pharmacy-filters__apply"
            onClick={() => setAppliedFilters(filters)}
            variant="outline"
          >
            Appliquer
          </Button>
          <Button asChild className="pharmacy-filters__add">
            <a href="/admin/pharmacies/nouvelle">
              <Plus aria-hidden="true" /> Ajouter une pharmacie
            </a>
          </Button>
        </div>
        <details className="pharmacy-directory-toolbar__advanced">
          <summary>Filtres avancés</summary>
          <label>
            District
            <Input
              placeholder="Tous les districts"
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
        </details>
      </div>
      {loading ? (
        <p aria-label="Chargement des pharmacies" role="status">
          Chargement…
        </p>
      ) : (
        <ErrorNotice>{error}</ErrorNotice>
      )}
      {!loading && error && (
        <div className="detail-actions">
          <Button onClick={() => setRefresh((value) => value + 1)}>
            Réessayer
          </Button>
        </div>
      )}
      {!loading &&
        !error &&
        (data.length ? (
          <AdminPharmacyList pharmacies={data} total={total} />
        ) : (
          <p>Aucune pharmacie à afficher</p>
        ))}
      {!loading && !error && (
        <div className="pharmacy-directory-pagination">
          <span>
            Affichage de{" "}
            {data.length
              ? (appliedFilters.page - 1) * appliedFilters.pageSize + 1
              : 0}{" "}
            à {Math.min(appliedFilters.page * appliedFilters.pageSize, total)}{" "}
            sur {total} pharmacies
          </span>
          <label className="pharmacy-directory-pagination__size">
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
          <Button disabled variant="outline" title="Export indisponible">
            <Download aria-hidden="true" /> Exporter
          </Button>
          <Button
            variant="outline"
            disabled={appliedFilters.page <= 1}
            onClick={() => {
              const next = { ...appliedFilters, page: appliedFilters.page - 1 };
              setAppliedFilters(next);
              setFilters(next);
            }}
          >
            Page précédente
          </Button>
          <Button
            variant="outline"
            disabled={appliedFilters.page >= totalPages}
            onClick={() => {
              const next = { ...appliedFilters, page: appliedFilters.page + 1 };
              setAppliedFilters(next);
              setFilters(next);
            }}
          >
            Page suivante
          </Button>
        </div>
      )}
    </section>
  );
}
