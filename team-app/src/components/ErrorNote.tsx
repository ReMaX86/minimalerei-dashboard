export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-tbw-red/10 px-4 py-3 text-sm font-medium text-tbw-red">
      {message}
    </div>
  );
}
