-- Remove legacy sensitive Aadhaar values left by the retired verification flow.
-- The active OTP flow stores only last4 and provider reference metadata.
update public.tbl_user_verification
set aadhaar_number = null,
    aadhaar_otp_code = null,
    aadhaar_client_id = null,
    aadhaar_otp_created_at = null,
    updated_at = now()
where aadhaar_number is not null
   or aadhaar_otp_code is not null
   or aadhaar_client_id is not null
   or aadhaar_otp_created_at is not null;

