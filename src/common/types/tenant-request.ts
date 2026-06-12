export interface TenantRequest {
  tenant: { id: string; name: string };
  ip?: string;
}
