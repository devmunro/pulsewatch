declare module "country-iso-to-coordinates" {
  const countries: Record<string, { coordinate: [string, string]; name: string }>;
  export default countries;
}
