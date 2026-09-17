import { Icon, type IconName } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DiscoveryRoute } from "@/features/discovery/DiscoveryPage";
import { EmergencyContactsRoute } from "../features/emergency-contacts/EmergencyContactsRoute";
import { PharmacyDetailRoute } from "../features/pharmacy-detail/PharmacyDetailPage";
import { RoutePreviewRoute } from "../features/navigation/RoutePreviewPage";
import { SavedPharmaciesPage } from "../features/saved-pharmacies/SavedPharmaciesPage";

type PublicShellProps = { pathname: string };
const navigation: Array<{ href: string; icon: IconName; label: string }> = [
  { href: "/", icon: "home", label: "Accueil" },
  { href: "/urgences", icon: "shield", label: "Urgences" },
  { href: "/contribuer", icon: "plus", label: "Contribuer" },
];
const isCurrentRoute = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export function PublicShell({ pathname }: PublicShellProps) {
  const pharmacyDetailId = /^\/pharmacies\/([^/]+)\/?$/.exec(pathname)?.[1];
  const routePreviewId = /^\/pharmacies\/([^/]+)\/itineraire\/?$/.exec(
    pathname,
  )?.[1];
  return (
    <div
      className={
        routePreviewId
          ? "public-shell public-shell--route-preview"
          : pathname === "/enregistrees"
            ? "public-shell public-shell--saved"
            : pathname === "/"
              ? "public-shell public-shell--discovery"
              : pharmacyDetailId
                ? "public-shell public-shell--pharmacy-detail"
                : "public-shell"
      }
      data-shell="public"
    >
      <a className="skip-link" href="#public-content">
        Aller au contenu
      </a>
      <header className="public-header">
        <a aria-label="Pharma Garde, accueil" className="brand" href="/">
          <img alt="" height="40" src="/brand-app-icon.png" width="40" />
          <span>Pharma Garde</span>
        </a>
        <Badge
          className="wanzila-badge wanzila-badge--accent"
          variant="secondary"
        >
          Public
        </Badge>
      </header>
      {pathname === "/" ? (
        <DiscoveryRoute />
      ) : pathname === "/enregistrees" ? (
        <SavedPharmaciesPage />
      ) : routePreviewId ? (
        <RoutePreviewRoute id={routePreviewId} />
      ) : pharmacyDetailId ? (
        <PharmacyDetailRoute id={pharmacyDetailId} />
      ) : (
        <main
          className={`public-main${
            pathname === "/urgences" ? " public-main--emergency" : ""
          }`}
          id="public-content"
        >
          {pathname === "/urgences" ? (
            <EmergencyContactsRoute />
          ) : (
            <>
              <Card className="public-intro">
                <CardContent>
                  <p className="overline">Pharma Garde</p>
                  <h1>Une information de santé, accessible à tous.</h1>
                  <p>
                    Cette surface établit la navigation et les composants
                    partagés de l’interface publique.
                  </p>
                </CardContent>
              </Card>
              <section
                aria-labelledby="public-surface-title"
                className="public-status-panel"
              >
                <span
                  aria-hidden="true"
                  className="public-status-panel__handle"
                />
                <h2 id="public-surface-title">Surface publique</h2>
                <EmptyState icon="home" title="Écran en préparation">
                  Les fonctionnalités de consultation seront ajoutées dans leurs
                  issues dédiées.
                </EmptyState>
                <Alert className="public-feedback">
                  <AlertDescription>
                    Les éléments visibles ici sont des primitives de
                    présentation ; aucune donnée n’est chargée.
                  </AlertDescription>
                </Alert>
              </section>
            </>
          )}
        </main>
      )}
      <nav aria-label="Navigation publique" className="public-navigation">
        {navigation.map((item) => (
          <a
            aria-current={
              isCurrentRoute(item.href, pathname) ? "page" : undefined
            }
            href={item.href}
            key={item.href}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
