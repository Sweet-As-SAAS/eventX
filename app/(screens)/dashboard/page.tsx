import { Home } from "@/components/home";
import { userName } from "@/components/user";

// Home (PRD F15): one greeting, one input, then where everything stands.
export default async function HomePage() {
  return <Home name={await userName()} />;
}
