/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'UserError';
  }
}

export class ForbiddenError extends UserError {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  constraint_name?: string;
  constraint?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  prospects_phone_unique: 'A prospect with this phone number already exists in this office.',
  prospects_email_unique: 'A prospect with this email address already exists in this office.',
  users_email_key: 'An account with this email already exists.',
  attendance_records_office_id_user_id_att_date_key: 'Attendance has already been recorded for this member on that date.',
  memberships_office_id_user_id_key: 'This person is already a member of the office.',
  challenge_participants_challenge_id_user_id_key: 'You have already joined this challenge.',
  challenge_submissions_client_token_key: 'This submission was already received.',
  personal_transactions_client_token_key: 'This transaction was already recorded.',
  challenge_rewards_challenge_id_user_id_key: 'A reward has already been recorded for this participant.',
  activity_registrations_activity_id_user_id_key: 'You are already registered for this activity.',
  fine_disputes_one_open: 'There is already an open dispute for this fine.',
  office_plans_office_id_month_key: 'A plan already exists for that month.',
  personal_accounts_office_id_user_id_name_key: 'You already have an account with that name.',
  office_accounts_office_id_name_key: 'An account with that name already exists.',
  teams_office_id_name_key: 'A team with that name already exists.',
  levels_office_id_rank_key: 'A level with that rank already exists.',
  levels_office_id_name_key: 'A level with that name already exists.',
  finance_categories_office_id_scope_kind_name_key: 'That category already exists.',
  fine_categories_office_id_name_key: 'That fine category already exists.',
  budgets_office_id_category_id_month_key: 'A budget for that category and month already exists.',
  offices_slug_key: 'That office slug is already in use.',
  personal_transactions_reverses_id_key: 'This transaction has already been corrected.',
  office_transactions_reverses_id_key: 'This transaction has already been reversed.',
  office_transactions_expense_id_key: 'This expense has already been posted to the office books.',
  office_transactions_fine_payment_id_key: 'This payment has already been posted to the office books.',
};

/** Maps database/application errors to a user-safe message. Unknown errors become a generic message. */
export function toUserMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const e = err as PgLikeError;
  if (e && typeof e.code === 'string') {
    const constraint = e.constraint_name ?? e.constraint;
    if (e.code === '23505') return (constraint && CONSTRAINT_MESSAGES[constraint]) || 'This record already exists.';
    if (e.code === 'P0001') return e.message ?? 'The request was rejected.';
    if (e.code === '42501') {
      if (e.message && !e.message.startsWith('new row violates') && !e.message.startsWith('permission denied')) return e.message;
      return 'You do not have permission to do that.';
    }
    if (e.code === '23503') return e.message?.startsWith('Referenced') ? e.message : 'A related record could not be found.';
    if (e.code === '23514') return 'Some values are not allowed. Please review the form.';
    if (e.code === '22P02' || e.code === '22007' || e.code === '22008') return 'One of the values has an invalid format.';
  }
  return 'Something went wrong. Please try again.';
}
