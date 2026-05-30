import { getUser } from "@/lib/auth/get-user";

export default async function DashboardPage() {
  const user = await getUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Welcome to Formuflash</h1>
      <p className="text-sm text-zinc-600">
        Signed in as {user?.email ?? "your account"}.
      </p>
      <p className="max-w-xl text-base text-zinc-700">
        Start building your institution hierarchy, then capture notes and
        generate flashcards as you study.
      </p>
    </div>
  );
}
