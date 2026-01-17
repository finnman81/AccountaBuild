export type Tier =
  | 'Iron'
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Master'
  | 'Challenger';

// 1=I, 2=II, 3=III, 4=IV
export type Division = 1 | 2 | 3 | 4;

export type Rank = {
  tier: Tier;
  division?: Division;
};

export type GoalType = 'workouts' | 'minutes' | 'calorieDays' | 'weightLoss' | 'weightGain';

