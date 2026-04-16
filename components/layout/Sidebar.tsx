export function Sidebar() {
  return (
    <aside className="hidden w-64 border-r border-border bg-surface/70 p-5 md:block">
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-text">Chats</div>
          <p className="mt-2 text-sm leading-6 text-text-tertiary">
            Conversation history arrives with the memory phase.
          </p>
        </div>
      </div>
    </aside>
  );
}
