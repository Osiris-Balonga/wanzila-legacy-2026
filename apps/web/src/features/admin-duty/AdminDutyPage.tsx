import { AdminDutyCreate } from "./AdminDutyCreate";
import { AdminDutyEdit } from "./AdminDutyEdit";
import { AdminDutyList } from "./AdminDutyList";
import { AdminDutySources } from "./AdminDutySources";
import { AdminDutyExceptions } from "./AdminDutyExceptions";
import "./admin-duty.css";
import "./admin-duty-operations.css";

export function AdminDutyPage({ pathname }: { pathname: string }) {
  if (pathname === "/admin/gardes/sources") return <AdminDutySources />;
  const exceptions = /^\/admin\/gardes\/([0-9a-f-]{36})\/exceptions$/i.exec(
    pathname,
  );
  if (exceptions) return <AdminDutyExceptions id={exceptions[1]!} />;
  const edit = /^\/admin\/gardes\/([0-9a-f-]{36})\/modifier$/i.exec(pathname);
  if (edit) return <AdminDutyEdit id={edit[1]!} />;
  return pathname === "/admin/gardes/nouvelle" ? (
    <AdminDutyCreate />
  ) : (
    <AdminDutyList />
  );
}
