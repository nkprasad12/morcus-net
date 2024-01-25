/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  BackendProviderContext,
  SavedContent,
  SavedContentBackend,
} from "@/web/client/pages/library/external_content_storage";
import { useContext, useEffect } from "react";
import { render } from "@testing-library/react";

global.structuredClone = jest.fn((val) => {
  return JSON.parse(JSON.stringify(val));
});

function TestComponent(props: { wrapper: { item: any } }) {
  const { useBackend } = useContext(BackendProviderContext);
  const backend = useBackend();

  useEffect(() => {
    props.wrapper.item = backend;
  }, [props, backend]);

  return <div />;
}

describe("useBackend from indexDb", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  test("happy path", async () => {
    const wrapper = { item: undefined };
    render(<TestComponent wrapper={wrapper} />);
    // @ts-ignore
    const backend: SavedContentBackend = wrapper.item;
    expect(await backend.getContentIndex()).toHaveLength(0);

    const item: SavedContent = { title: "Foo", content: "Bar" };
    const storedItems = await backend.saveContent(item);
    expect(storedItems).toHaveLength(1);
    const storedItem = storedItems[0];
    expect(storedItem.title).toBe(item.title);
    // @ts-ignore
    expect(storedItem.content).toBeUndefined();
    expect(await backend.getContentIndex()).toEqual(storedItems);

    const postDeleteItems = await backend.deleteContent(storedItem.storageKey);
    expect(postDeleteItems).toHaveLength(0);
    expect(await backend.getContentIndex()).toHaveLength(0);
  });
});
