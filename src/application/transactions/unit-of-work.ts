import type { Repositories, RepositoryDatabase } from '../../data/repositories';

export class UnitOfWork {
  constructor(private readonly db: RepositoryDatabase, private readonly repositories: Repositories) {}

  async run<T>(task: (repositories: Repositories) => Promise<T>): Promise<T> {
    let result: T | undefined;
    await this.db.withTransactionAsync(async () => { result = await task(this.repositories); });
    return result as T;
  }
}
