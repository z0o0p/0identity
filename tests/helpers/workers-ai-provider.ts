export function createWorkersAI(): (model: string) => { model: string } {
  return model => ({ model });
}
