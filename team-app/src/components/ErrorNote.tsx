export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-to-md bg-to-dangerSoft px-4 py-3 text-sm font-medium text-to-dangerText">
      {message}
    </div>
  );
}
