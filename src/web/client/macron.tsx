import React, { useState } from "react";

interface TextInputFieldProps {
  label: string;
  labelColor?: string;
  inputCallback: (input: string | undefined) => any;
  defaultValue?: string;
}

function TextInputField(props: TextInputFieldProps) {
  return (
    <div>
      <label color={props.labelColor}>{props.label}</label>
      <br />
      <textarea
        defaultValue={props.defaultValue}
        cols={40}
        rows={5}
        onChange={(event) => {
          const value = event.target.value;
          props.inputCallback(value.length === 0 ? undefined : value);
        }}
      />
      <br />
      <br />
    </div>
  );
}

async function process(input: string): Promise<string> {
  const response = await fetch(`${location.origin}/api/macronize/${input}`);
  if (!response.ok) {
    return "Processing failed, please try again later.";
  }
  console.log(response);
  return await response.text();
}

export function Macronizer() {
  const [rawInput, setRawInput] = useState<string | undefined>(undefined);
  const [processed, setProcessed] = useState<string | undefined>(undefined);

  async function handleClick() {
    if (rawInput === undefined) {
      return;
    }
    const start = performance.now();
    setProcessed(await process(rawInput));
    console.log(`${performance.now() - start} ms`);
  }

  return (
    <div>
      <TextInputField
        label="Enter text to macronize:"
        inputCallback={setRawInput}
      ></TextInputField>
      <button onClick={handleClick}>Macronize</button>
      <p>{processed || ""}</p>
    </div>
  );
}
