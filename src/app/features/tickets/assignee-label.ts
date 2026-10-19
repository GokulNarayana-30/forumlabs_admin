import { StaffTicketAssigneeDto } from './services/tickets.service';

/**
 * The label staff see for a ticket's assignee. It is never the assignee's user id (N-06): a user who
 * is no longer eligible (disabled, or their support grant removed) is not in the assignee list, so
 * they show as a former staff member; while the list is unavailable the ticket shows as assigned.
 */
export function assigneeLabelFor(
  userId: string | null,
  assignees: readonly StaffTicketAssigneeDto[],
  assigneesLoaded: boolean,
): string {
  if (!userId) return 'Unassigned';
  const match = assignees.find((a) => a.user_id === userId);
  if (match) return match.display_name;
  return assigneesLoaded ? 'Former staff member' : 'Assigned';
}
