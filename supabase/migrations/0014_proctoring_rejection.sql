-- Proctored AI video interview: auto-reject after repeated proctoring
-- violations (tab-switching, window-blur, blocked paste, no face /
-- multiple faces / looking away, camera-or-mic loss, fullscreen exit).
-- Additive only — widens two existing check constraints, same pattern as
-- every prior widening migration (0004, 0005, 0008, 0011).

alter table interviews drop constraint if exists interviews_status_check;
alter table interviews add constraint interviews_status_check
  check (status in (
    'QUEUED', 'DIALING', 'IN_PROGRESS', 'COMPLETED', 'NO_ANSWER', 'BUSY',
    'CALL_FAILED', 'NETWORK_ERROR', 'PROVIDER_ERROR', 'CANDIDATE_DISCONNECTED',
    'CONSENT_DECLINED', 'NEEDS_REVIEW', 'PROCTORING_TERMINATED'
  ));

alter table interview_events drop constraint if exists interview_events_event_type_check;
alter table interview_events add constraint interview_events_event_type_check
  check (event_type in (
    'CALL_STARTED', 'AI_INTRO', 'CONSENT_RECEIVED', 'CONSENT_DECLINED', 'QUESTION_ASKED',
    'ANSWER_RECEIVED', 'FOLLOWUP_GENERATED', 'SECTION_COMPLETED', 'CALL_ENDED',
    'EVALUATION_COMPLETED', 'CALL_FAILED', 'HUMAN_OVERRIDE',
    'CAMERA_ENABLED', 'PROCTORING_WARNING', 'PROCTORING_REJECTED'
  ));
