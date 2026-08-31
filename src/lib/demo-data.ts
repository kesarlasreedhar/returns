import { AppUser } from "@/types/domain";

export const DEMO_USERS: AppUser[] = [
  { id: "u1", name: "Admin User", role: "admin", email: "admin@returns.local" },
  { id: "u2", name: "Seller One", role: "seller", email: "seller1@returns.local" },
  { id: "u3", name: "Seller Two", role: "seller", email: "seller2@returns.local" },
  { id: "u4", name: "Processor One", role: "processor", email: "processor1@returns.local" }
];
