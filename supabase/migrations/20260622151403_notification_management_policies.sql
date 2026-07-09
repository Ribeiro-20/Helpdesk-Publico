create policy notif_update on notifications
for update
using (
  tenant_id = current_tenant_id()
  and current_role_name() in ('admin', 'operator')
)
with check (
  tenant_id = current_tenant_id()
  and current_role_name() in ('admin', 'operator')
);

create policy notif_delete on notifications
for delete
using (
  tenant_id = current_tenant_id()
  and current_role_name() in ('admin', 'operator')
);
