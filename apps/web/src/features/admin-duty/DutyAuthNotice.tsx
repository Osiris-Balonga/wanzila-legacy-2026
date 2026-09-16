export function DutyAuthNotice() {
  return (
    <div className="admin-duty__alert admin-duty__auth" role="alert">
      <p>Votre session d’administration a expiré.</p>
      <a href="/admin/connexion">Se connecter à l’administration</a>
    </div>
  );
}
