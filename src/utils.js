export function apiKeyValid(key) {
  const re = new RegExp(
    "^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$",
    "i"
  );

  return !key || !re.test(key) ? false : true;
}
