-- Production Hubble client configuration is stored in Vault outside source
-- control. This records only the non-secret environment switch used by the
-- authoritative Nitro ledger context.
update private.hubble_redemption_config
set environment='production',updated_at=now()
where singleton;
