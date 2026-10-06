create or replace function private.activity_location_city(p_location text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[];
  candidate text;
  normalized text;
  index integer;
begin
  normalized := trim(split_part(coalesce(p_location, ''), '·', 1));
  if normalized = '' or normalized = 'Google Maps venue' then return null; end if;
  parts := regexp_split_to_array(normalized, '\s*,\s*');
  if coalesce(array_length(parts, 1), 0) < 2 then return null; end if;

  for index in reverse coalesce(array_length(parts, 1), 0)..1 loop
    candidate := trim(parts[index]);
    continue when candidate = ''
      or candidate ~ '^[0-9]{5,6}$'
      or lower(candidate) in (
        'india', 'bharat', 'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar',
        'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand',
        'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
        'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
        'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
        'andaman and nicobar islands', 'chandigarh', 'dadra and nagar haveli and daman and diu',
        'delhi', 'jammu and kashmir', 'ladakh', 'lakshadweep', 'puducherry'
      )
      or lower(candidate) ~ '(district|subdistrict|mandal|taluk|tehsil|county|ward)$'
      or lower(candidate) ~ ' (north|south|east|west)$';
    if length(candidate) between 2 and 80 then return candidate; end if;
  end loop;
  return null;
end
$$;

revoke all on function private.activity_location_city(text) from public, anon, authenticated;
