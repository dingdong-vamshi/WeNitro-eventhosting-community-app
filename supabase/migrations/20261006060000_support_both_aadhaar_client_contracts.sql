-- Both the current DigiLocker SDK client and previously deployed Aadhaar OTP
-- clients can complete a server-owned production verification. The evidence
-- column required by the constraint depends on the versioned consent contract.
alter table private.aadhaar_verification_sessions
  drop constraint if exists aadhaar_verification_sessions_check;

alter table private.aadhaar_verification_sessions
  add constraint aadhaar_verification_sessions_check
  check(verified_at is null or (
    environment = 'production'
    and status = 'succeeded'
    and (
      (consent_version = 'wenitro-aadhaar-digilocker-sdk-v1' and provider_session_id is not null)
      or
      (consent_version = 'wenitro-aadhaar-okyc-v1' and provider_reference_id is not null)
    )
  ));

notify pgrst,'reload schema';
