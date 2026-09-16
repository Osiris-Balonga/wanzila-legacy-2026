import { AdminDutyCreate } from "./AdminDutyCreate";
import { AdminDutyList } from "./AdminDutyList";
import "./admin-duty.css";

export function AdminDutyPage({ pathname }: { pathname: string }) {
  return pathname === "/admin/gardes/nouvelle" ? (
    <AdminDutyCreate />
  ) : (
    <AdminDutyList />
  );
}
