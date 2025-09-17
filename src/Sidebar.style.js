import tag from "html-tag-js";

export default (SidebarStyle = tag("style", {
  id: "wakatime",
  innerHTML: `
    #sidebar > .container.wakatime * {
      box-sizing: border-box;
    }
    #sidebar > .container.wakatime {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: .5rem;
      gap: .5rem;
    }
    .waka-header {
      display: flex;
      align-items: center;
      width: 100%;
      height: 3rem;
      background-color: var(--secondary-color);
      border: 1px solid var(--border-color);
      border-radius: .5rem;
      padding: 0 .4rem;
      gap: .5rem;
    }
    .waka-header > .icon {
      display: flex;
      align-items: center;
      height: 2rem;
      width: 2.5rem;
      border-radius: 0;
      border-radius: .25rem;
      border: 1px solid var(--border-color);
      background-color: var(--primary-color);
    }
    .waka-header > .waka-title {
      display: flex;
      flex-direction: column;
      width: 100%;
      color: var(--primary-text-color);
    }
    .waka-header > .waka-title > .waka-title-text {
      font-weight: 600;
    }
    .waka-header > .waka-title > .waka-title-subtext {
      opacity: .5;
      font-size: .8rem;
    }
    .waka-warn {
      display: none;
      align-items: center;
      width: 100%;
      padding: .5rem;
      gap: .25rem;
      border-radius: .5rem;
      border: 1px solid rgb(from rgba(255,185,92,.8) r g b / 0.5);
      color: rgb(from rgba(255,185,92,.8) r g b / 0.95);
      background: radial-gradient(
        circle,
        rgba(0, 0, 0, 0) 5%,
        rgb(from rgba(255,185,92,.8) r g b / 0.25)
      );
    }
    .waka-warn.show {
      display: flex;
    }
    .waka-warn > .waka-text {
      font-size: .8rem;
      font-weight: 400;
    }
    .waka-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      gap: .5rem;
    }
    .waka-main {
      flex-direction: column;
      display: flex;
      align-items: center;
      width: 100%;
      background-color: var(--secondary-color);
      border: 1px solid var(--border-color);
      border-radius: .5rem;
      padding: .5rem;
      gap: .5rem;
    }
    .waka-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .waka-text {
      font-weight: 500;
      flex-grow: 1;
      font-size: .9rem;
      flex-shrink: 1;
    }
    .waka-subtext {
      opacity: .5;
      font-size: .8rem;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      max-width: 60%;
    }
    .waka-item.connection {
      gap: .25rem;
    }
    .waka-item.connection[data-connection="on"] > .waka-subtext:after {
      content: "connected";
    }
    .waka-item.connection[data-connection="off"] > .waka-subtext:after {
      content: "disconnected";
    }
    .waka-item.connection > .waka-icon {
      width: .5rem;
      height: .5rem;
      border-radius: 50%;
      background-color: rgba(240, 10, 10, 0.5);
    }
    .waka-item.connection[data-connection="on"] > .waka-icon {
      content: "";
      background-color: rgba(10, 240, 10, 0.5);
    }
    .waka-item:has(.waka-subitem) {
      flex-direction: column;
      font-size: .5rem;
      gap: .5rem;
    }
    .waka-item:has(.waka-subitem) .waka-text {
      width: 100%;
      font-weight: 450;
      display: flex;
    }
    .waka-subitem {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: .5rem;
      width: 100%;
      border-radius: .5rem;
      gap: .5rem;
      background-color: var(--primary-color);
    }
    .waka-subitem.type-square {
      flex-direction: row;
      background-color: inherit;
      padding: 0;
    }
    .waka-subitem.type-square .waka-item {
      flex-direction: column;
      align-items: center;
      padding: .5rem 0;
      border-radius: .5rem;
      background-color: var(--primary-color);
    }
    .waka-subitem.type-square .waka-item .waka-text {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .waka-subitem.type-square .waka-item .waka-subtext {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .waka-item:has(.waka-subitem.type-select) {
      flex-direction: row;
    }
    .waka-subitem.type-select {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: auto;
      padding: .5rem;
      border: 1px solid var(--border-color);
    }
    .waka-subitem.type-select .waka-subtext {
      overflow: inherit;
      text-overflow: unset;
      min-width: auto;
      max-width: auto;
    }
    .waka-subitem.type-select .icon {
      opacity: .5;
    }
    .waka-main.current-file[data-isfile="false"] {
      justify-content: center;
      padding: 1rem;
    }
    .waka-main.current-file[data-isfile="true"] > .waka-item > .waka-text:after {
      content: "Current File";
    }
    .waka-main.current-file[data-isfile="false"] > .waka-item > .waka-text:after {
      content: "Current Tab Isn't A Text File";
    }
    .waka-main.current-file[data-isfile="false"] .waka-subitem {
      display: none;
    }`,
}));
