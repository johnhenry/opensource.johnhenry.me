// The app, written against injected dependencies so it runs both through the frame's native import map (app-main.mjs)
// and through modules the planet loaded with router.import(). Ported from mport's examples/app-view.mjs.
export const App = ({ h, useState, htm }) => {
  const html = htm.bind(h);
  return function TodoApp({ sources }) {
    const [todos, setTodos] = useState([
      { text: "Resolve each package once", done: true },
      { text: "Let any mirror of the same build serve it", done: false },
    ]);
    const [text, setText] = useState("");
    const add = (e) => {
      e.preventDefault();
      if (text.trim()) { setTodos([...todos, { text: text.trim(), done: false }]); setText(""); }
    };
    const toggle = (i) => setTodos(todos.map((t, j) => (j === i ? { ...t, done: !t.done } : t)));
    return html`
      <form class="add" onSubmit=${add}>
        <input type="text" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Add a todo" aria-label="New todo" />
        <button>Add</button>
      </form>
      <ul class="todos">
        ${todos.map((t, i) => html`
          <li class=${t.done ? "todo done" : "todo"}>
            <label><input type="checkbox" checked=${t.done} onChange=${() => toggle(i)} /><span>${t.text}</span></label>
          </li>`)}
      </ul>
      <p class="status" data-app-status>
        rendered with ${sources.length ? sources.map((p) => `${p.label} ${p.version} from ${p.provider}`).join(" · ") : "no sources"}
      </p>`;
  };
};
