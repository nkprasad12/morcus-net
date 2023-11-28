/* istanbul ignore file */

import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import React, { useState } from "react";
import ReactDOM from "react-dom/client";

const root = ReactDOM.createRoot(
  document.querySelector("#placeholder") as HTMLElement
);

const POST_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
};

async function getNext(result: string): Promise<string> {
  const address = `${location.origin}/respond`;
  const response = await fetch(address, {
    method: "POST",
    headers: POST_HEADERS,
    body: result,
  });
  if (!response.ok) {
    return Promise.reject(new Error(`Status ${response.status} on ${address}`));
  }
  return response.text();
}

export function Editor() {
  const [text, setText] = useState<string | undefined>(undefined);

  if (text === undefined) {
    return (
      <div>
        <button
          type="button"
          onClick={async () => {
            setText(
              XmlNodeSerialization.DEFAULT.deserialize(
                await getNext("")
              ).toString()
            );
          }}
        >
          Start
        </button>
      </div>
    );
  }

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={async () => {
            // @ts-ignore
            const e: HTMLTextAreaElement = document.getElementById(
              "XmlNodeEditorTextarea"
            )!;
            const editedValue = e.value;
            e.value = "Waiting for next entry...";
            e.value = await getNext(editedValue);
          }}
        >
          Next
        </button>
      </div>
      <div>
        <textarea
          cols={120}
          rows={1000}
          id="XmlNodeEditorTextarea"
          defaultValue={text}
        />
      </div>
    </div>
  );
}

root.render(<Editor />);
