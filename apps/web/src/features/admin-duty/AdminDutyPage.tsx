import { AdminDutyCreate } from "./AdminDutyCreate";
import { AdminDutyEdit } from "./AdminDutyEdit";
import { AdminDutyList } from "./AdminDutyList";
import "./admin-duty.css";

export function AdminDutyPage({ pathname }: { pathname: string }) {
  const edit = /^\/admin\/gardes\/([0-9a-f-]{36})\/modifier$/i.exec(pathname);
  if (edit) return <AdminDutyEdit id={edit[1]!} />;
  return pathname === "/admin/gardes/nouvelle" ? (
    <AdminDutyCreate />
  ) : (
    <AdminDutyList />
  );
}
