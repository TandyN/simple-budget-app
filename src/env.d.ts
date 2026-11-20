interface Window {
  readonly trustedTypes?: {
    createPolicy(
      name: string,
      rules: {
        createScriptURL?: (input: string) => string;
      },
    ): {
      createScriptURL(input: string): unknown;
    };
  };
}
