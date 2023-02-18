from xml.etree import ElementTree

from src.py.utils.data import TextPart


def print_elem(root) -> None:
  print(root)
  print(root.tag)
  print(root.attrib)
  print(root.text)
  print(root.tail)
  for x in root:
    print_elem(x)


def get_text(element: ElementTree.Element) -> str:
  assert element.tag == '{http://www.tei-c.org/ns/1.0}p'
  text = element.text or ''
  for child in element:
    assert len(child) == 0
    text += child.text or ''
    text += child.tail or ''
  text += element.tail or ''
  return text


def parse_perseus_xml(file_path: str) -> 'list[TextPart]':
  text: list[TextPart] = []

  stack = [ElementTree.parse(file_path).getroot()]
  chapter = None
  book = None
  section = None

  while stack:
    top = stack.pop()
    for child in top:
      stack.append(child)

    if 'type' not in top.attrib:
      continue
    if top.attrib['type'] != 'textpart':
      continue
    text_type = top.attrib.get('subtype', None)
    if text_type is None:
      continue

    if text_type == 'book':
      book = int(top.attrib['n'])
      chapter = None
      section = None
      continue
    elif text_type == 'chapter':
      chapter = int(top.attrib['n'])
      section = None
      continue
    elif text_type == 'section':
      section = int(top.attrib['n'])
    else:
      raise AssertionError('Unexpected text type: %s', text_type)

    assert book is not None
    assert chapter is not None
    assert section is not None
    assert len(top) == 1

    text.append(
      TextPart(
        book=book, 
        chapter=chapter, 
        section=section, 
        text = get_text(top[0])))

  text.sort()
  return text
