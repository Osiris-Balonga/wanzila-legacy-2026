import { useRef, useState, type RefObject } from "react";
import { Icon, type IconName } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";
import {
  AdminConnection,
  AdminPharmacyDirectory,
} from "../features/admin-pharmacy/AdminPharmacyDirectory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type AdminShellProps = { pathname: string };
const administrationLinks: Array<{
  href: string;
  icon: IconName;
  label: string;
}> = [
  { href: "/admin", icon: "dashboard", label: "Vue d’ensemble" },
  { href: "/admin/pharmacies", icon: "pharmacy", label: "Pharmacies" },
  { href: "/admin/gardes", icon: "calendar", label: "Gardes" },
  { href: "/admin/contributions", icon: "users", label: "Contributions" },
  { href: "/admin/signalements", icon: "file", label: "Signalements" },
  { href: "/admin/qualite", icon: "shield", label: "Qualité des données" },
  { href: "/admin/parametres", icon: "settings", label: "Paramètres" },
];
const isCurrentRoute = (href: string, pathname: string) =>
  href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

function Navigation({
  compact = false,
  firstLinkRef,
  pathname,
}: {
  compact?: boolean;
  firstLinkRef?: RefObject<HTMLAnchorElement | null>;
  pathname: string;
}) {
  return (
    <nav
      aria-label="Navigation administration"
      className={compact ? "admin-nav admin-nav--compact" : "admin-nav"}
    >
      {administrationLinks.map((item, index) => (
        <a
          aria-current={
            isCurrentRoute(item.href, pathname) ? "page" : undefined
          }
          href={item.href}
          key={item.href}
          ref={index === 0 ? firstLinkRef : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function AdminShell({ pathname }: AdminShellProps) {
  const [activeTabId, setActiveTabId] = useState("overview");
  const mobileNavigationFirstLinkRef = useRef<HTMLAnchorElement>(null);

  if (pathname === "/admin/connexion") {
    return <AdminConnection />;
  }

  const isPharmacyRoute = pathname.startsWith("/admin/pharmacies");

  return (
    <div className="admin-shell" data-shell="admin">
      <a className="skip-link" href="#admin-content">
        Aller au contenu
      </a>
      <aside className="admin-sidebar">
        <a
          aria-label="Pharma Garde administration"
          className="brand"
          href="/admin"
        >
          <img alt="" height="40" src="/brand-app-icon.png" width="40" />
          <span>Pharma Garde</span>
        </a>
        <Badge
          className="wanzila-badge wanzila-badge--accent"
          variant="secondary"
        >
          Admin
        </Badge>
        <Navigation pathname={pathname} />
        <p className="admin-sidebar__note">
          Fondation de l’espace d’administration.
        </p>
      </aside>
      <header className="admin-header">
        <a
          aria-label="Pharma Garde administration"
          className="brand brand--small"
          href="/admin"
        >
          <img alt="" height="36" src="/brand-app-icon.png" width="36" />
          <span>Pharma Garde</span>
        </a>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              aria-label="Ouvrir le menu d’administration"
              className="admin-menu"
              variant="ghost"
            >
              <Icon name="menu" />
              <span>Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            className="admin-sheet-content"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              mobileNavigationFirstLinkRef.current?.focus();
            }}
            side="left"
          >
            <SheetHeader>
              <SheetTitle>Navigation administration</SheetTitle>
              <SheetDescription>
                Accédez aux sections de gestion de Pharma Garde.
              </SheetDescription>
            </SheetHeader>
            <div className="admin-sheet-navigation">
              <Navigation
                compact
                firstLinkRef={mobileNavigationFirstLinkRef}
                pathname={pathname}
              />
            </div>
          </SheetContent>
        </Sheet>
        <div className="admin-header__tools">
          <Label className="sr-only" htmlFor="admin-search">
            Recherche
          </Label>
          <Input
            aria-label="Recherche indisponible"
            disabled
            id="admin-search"
            placeholder="Recherche indisponible"
          />
          <span aria-label="Notifications" className="notification-indicator">
            <Icon name="bell" />
          </span>
        </div>
      </header>
      <main className="admin-main" id="admin-content">
        {isPharmacyRoute ? (
          <AdminPharmacyDirectory pathname={pathname} />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="overline">Administration</p>
                <h1>Fondation de l’interface</h1>
                <p>
                  Un cadre de navigation et des composants cohérents pour les
                  futures surfaces.
                </p>
              </div>
              <Badge className="wanzila-badge" variant="secondary">
                Sans données
              </Badge>
            </div>
            <Tabs onValueChange={setActiveTabId} value={activeTabId}>
              <TabsList
                aria-label="Sections de démonstration"
                className="admin-tabs"
              >
                <TabsTrigger
                  tabIndex={activeTabId === "overview" ? 0 : -1}
                  value="overview"
                >
                  Vue d’ensemble
                </TabsTrigger>
                <TabsTrigger
                  tabIndex={activeTabId === "components" ? 0 : -1}
                  value="components"
                >
                  Composants
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <Card className="admin-placeholder">
                  <CardContent>
                    <EmptyState
                      icon="dashboard"
                      title="Surface prête à assembler"
                    >
                      Les tableaux, flux et métriques relèvent des issues métier
                      à venir.
                    </EmptyState>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="components">
                <Card className="admin-placeholder">
                  <CardContent>
                    <EmptyState
                      icon="settings"
                      title="Primitives prêtes à employer"
                    >
                      Les composants partagés sont accessibles aux futures
                      surfaces sans ajouter de logique métier.
                    </EmptyState>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
