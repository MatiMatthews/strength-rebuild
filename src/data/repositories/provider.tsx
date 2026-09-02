import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { UnitOfWork } from '../../application/transactions/unit-of-work';
import { ProgramService } from '../../application/programs/program-service';
import { WorkoutService } from '../../application/workouts/workout-service';
import { WeeklyReviewService } from '../../application/progression/weekly-review';
import { BackupService } from '../../application/export';
import { createRepositories, type Repositories, type RepositoryDatabase } from '.';

export interface DataServices {
  repositories: Repositories;
  unitOfWork: UnitOfWork;
  programs: ProgramService;
  workouts: WorkoutService;
  weeklyReviews: WeeklyReviewService;
  backups: BackupService;
}

const DataContext = createContext<DataServices | null>(null);

export function RepositoryProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext() as RepositoryDatabase;
  const services = useMemo(() => {
    const repositories = createRepositories(database);
    return {
      repositories,
      unitOfWork: new UnitOfWork(database, repositories),
      programs: new ProgramService(database),
      workouts: new WorkoutService(database, repositories.workouts),
      weeklyReviews: new WeeklyReviewService(database),
      backups: new BackupService(database),
    };
  }, [database]);

  return <DataContext.Provider value={services}>{children}</DataContext.Provider>;
}

export function useDataServices() {
  const services = useContext(DataContext);
  if (!services) throw new Error('useDataServices must be used inside RepositoryProvider');
  return services;
}
