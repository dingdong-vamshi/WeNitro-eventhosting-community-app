-- Cover participant-rating foreign keys used by cascades and profile/rating lookups.
-- Existing composite indexes begin with event_id/rating_id, so they do not cover
-- queries that start from rater_id or parameter_id.

create index if not exists idx_participant_ratings_rater
  on public.tbl_participant_ratings (rater_id);

create index if not exists idx_participant_rating_scores_parameter
  on public.tbl_participant_rating_scores (parameter_id);
