export function confirmedActivityParticipation(status?: string | null) {
  return status === 'going' || status === 'approved' || status === 'paid';
}

export function activityHistoryParticipationLabel(status?: string | null) {
  if (confirmedActivityParticipation(status)) return 'Joined';
  switch (status) {
    case 'pending': return 'Approval pending';
    case 'payment_required':
    case 'approved_pending_payment': return 'Payment required';
    case 'payment_pending': return 'Payment pending';
    case 'payment_failed': return 'Payment failed';
    case 'waitlist': return 'Waitlisted';
    case 'interested': return 'Interested';
    case 'rejected': return 'Request rejected';
    case 'declined': return 'Declined';
    case 'left': return 'Left activity';
    case 'no_show': return 'Did not attend';
    default: return 'Participation status unavailable';
  }
}
