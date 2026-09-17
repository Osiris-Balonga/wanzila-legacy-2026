import { AdminContributionList } from "./AdminContributionList";
import { AdminContributionDetail } from "./AdminContributionDetail";
import "./admin-contributions.css";

export function AdminContributionsPage({ pathname }: { pathname: string }) {
  const id = pathname.match(/^\/admin\/contributions\/([^/]+)\/?$/)?.[1];
  return id ? <AdminContributionDetail id={id} /> : <AdminContributionList />;
}
