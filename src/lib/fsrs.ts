import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type RecordLogItem,
  type Grade,
} from "ts-fsrs";

export { Rating };
export type { Card, RecordLogItem };

const f = fsrs(generatorParameters({ enable_fuzz: true }));

export type RatingLabel = "Again" | "Hard" | "Good" | "Easy";

const LABEL_TO_RATING: Record<RatingLabel, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

export function newCard(): Card {
  return createEmptyCard();
}

export function scheduleCard(
  card: Card,
  rating: RatingLabel,
  now = new Date()
): RecordLogItem {
  const result = f.repeat(card, now);
  return result[LABEL_TO_RATING[rating]];
}

export function allSchedules(card: Card, now = new Date()) {
  const result = f.repeat(card, now);
  return {
    Again: result[Rating.Again],
    Hard: result[Rating.Hard],
    Good: result[Rating.Good],
    Easy: result[Rating.Easy],
  };
}

// Converts a db srs_card row into a ts-fsrs Card object
export function dbRowToCard(row: {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: number;
  dueDate: Date;
  lastReview: Date | null;
}): Card {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    learning_steps: row.learningSteps,
    state: row.state as Card["state"],
    due: row.dueDate,
    last_review: row.lastReview ?? undefined,
  };
}

export function cardToDbRow(card: Card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    state: card.state,
    dueDate: card.due,
    lastReview: card.last_review ?? null,
  };
}
