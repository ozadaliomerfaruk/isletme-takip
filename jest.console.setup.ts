const renderConsoleValue = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

let unexpectedConsoleError: jest.SpyInstance;

beforeEach(() => {
  unexpectedConsoleError = jest
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]) => {
      throw new Error(
        `Unexpected console.error: ${args.map(renderConsoleValue).join(' ')}`,
      );
    });
});

afterEach(() => {
  unexpectedConsoleError.mockRestore();
});
