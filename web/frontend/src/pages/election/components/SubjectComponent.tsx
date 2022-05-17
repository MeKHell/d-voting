import { FC, ReactElement, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import * as types from '../../../types/configuration';
import { RANK, SELECT, SUBJECT, TEXT } from '../../../types/configuration';
import { newRank, newSelect, newSubject, newText } from '../../../types/getObjectType';

import Question from './Question';
import SubjectDropdown from './SubjectDropdown';
import {
  CheckIcon,
  ChevronUpIcon,
  CursorClickIcon,
  FolderIcon,
  MenuAlt1Icon,
  SwitchVerticalIcon,
  XIcon,
} from '@heroicons/react/outline';
import { PencilIcon } from '@heroicons/react/solid';

const MAX_NESTED_SUBJECT = 1;

type SubjectComponentProps = {
  notifyParent: (subject: types.Subject) => void;
  removeSubject: () => void;
  subjectObject: types.Subject;
  nestedLevel: number;
};

const SubjectComponent: FC<SubjectComponentProps> = ({
  notifyParent,
  removeSubject,
  subjectObject,
  nestedLevel,
}) => {
  const [subject, setSubject] = useState<types.Subject>(subjectObject);
  const isSubjectMounted = useRef<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [titleChanging, setTitleChanging] = useState<boolean>(true);

  const [components, setComponents] = useState<ReactElement[]>([]);

  const { Title, Order, Elements } = subject;

  // When a property changes, we notify the parent with the new subject object
  useEffect(() => {
    // We only notify the parent when the subject is mounted
    if (!isSubjectMounted.current) {
      isSubjectMounted.current = true;
      return;
    }
    notifyParent(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const localNotifyParent = (subj: types.Subject) => {
    const newElements = new Map(Elements);
    newElements.set(subj.ID, subj);
    setSubject({ ...subject, Elements: newElements, Title });
  };

  const notifySubject = (question: types.SubjectElement) => {
    if (question.Type !== SUBJECT) {
      const newElements = new Map(Elements);
      newElements.set(question.ID, question);
      setSubject({ ...subject, Elements: newElements });
    }
  };

  const addSubject = () => {
    const newElements = new Map(Elements);
    const newSubj = newSubject();
    newElements.set(newSubj.ID, newSubj);
    setSubject({ ...subject, Elements: newElements, Order: [...Order, newSubj.ID] });
  };

  const addQuestion = (question: types.SubjectElement) => {
    const newElements = new Map(Elements);
    newElements.set(question.ID, question);
    setSubject({ ...subject, Elements: newElements, Order: [...Order, question.ID] });
  };

  const localRemoveSubject = (subjID: types.ID) => () => {
    const newElements = new Map(Elements);
    newElements.delete(subjID);
    setSubject({
      ...subject,
      Elements: newElements,
      Order: Order.filter((id) => id !== subjID),
    });
  };

  const removeChildQuestion = (question: types.SubjectElement) => () => {
    const newElements = new Map(Elements);
    newElements.delete(question.ID);
    setSubject({
      ...subject,
      Elements: newElements,
      Order: Order.filter((id) => id !== question.ID),
    });
  };

  // Sorts the questions components & sub-subjects according to their Order into
  // the components state array
  useEffect(() => {
    // findQuestion return the react element based on the question/subject ID.
    // Returns undefined if the question/subject ID is unknown.
    const findQuestion = (id: types.ID): ReactElement => {
      if (!Elements.has(id)) {
        return undefined;
      }

      const found = Elements.get(id);

      switch (found.Type) {
        case TEXT:
          const text = found as types.TextQuestion;
          return (
            <Question
              key={`text${text.ID}`}
              question={text}
              notifyParent={notifySubject}
              removeQuestion={removeChildQuestion(text)}
            />
          );
        case SUBJECT:
          const sub = found as types.Subject;
          return (
            <SubjectComponent
              notifyParent={localNotifyParent}
              removeSubject={localRemoveSubject(sub.ID)}
              subjectObject={sub}
              nestedLevel={nestedLevel + 1}
              key={sub.ID}
            />
          );
        case RANK:
          const rank = found as types.RankQuestion;
          return (
            <Question
              key={`rank${rank.ID}`}
              question={rank}
              notifyParent={notifySubject}
              removeQuestion={removeChildQuestion(rank)}
            />
          );
        case SELECT:
          const select = found as types.SelectQuestion;
          return (
            <Question
              key={`select${select.ID}`}
              question={select}
              notifyParent={notifySubject}
              removeQuestion={removeChildQuestion(select)}
            />
          );
      }
    };

    setComponents(Order.map((id) => findQuestion(id)));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Title, Elements, Order, nestedLevel]);

  useEffect(() => {
    if (components.length === 0) {
      // resets the icon state if there are no questions
      setIsOpen(false);
    }
  }, [components]);

  const dropdownContent = [
    {
      name: 'Add rank',
      icon: <SwitchVerticalIcon className="mr-2 h-5 w-5" aria-hidden="true" />,
      onClick: () => {
        setIsOpen(true);
        addQuestion(newRank());
      },
    },
    {
      name: 'Add select',
      icon: <CursorClickIcon className="mr-2 h-5 w-5" aria-hidden="true" />,
      onClick: () => {
        setIsOpen(true);
        addQuestion(newSelect());
      },
    },
    {
      name: 'Add text',
      icon: <MenuAlt1Icon className="mr-2 h-5 w-5" aria-hidden="true" />,
      onClick: () => {
        setIsOpen(true);
        addQuestion(newText());
      },
    },
    {
      name: 'Remove subject',
      icon: <XIcon className="mr-2 h-5 w-5" aria-hidden="true" />,
      onClick: removeSubject,
    },
  ];
  if (nestedLevel < MAX_NESTED_SUBJECT) {
    dropdownContent.splice(3, 0, {
      name: 'Add subject',
      icon: <FolderIcon className="mr-2 h-5 w-5" aria-hidden="true" />,
      onClick: () => {
        setIsOpen(true);
        addSubject();
      },
    });
  }

  return (
    <div className={`${nestedLevel === 0 ? 'border-t' : 'pl-3'} `}>
      <div className="flex flex-row justify-between w-full h-24 ">
        <div className="flex flex-col pl-2">
          <div className="mt-3 flex">
            <div className="h-9 w-9 rounded-full bg-gray-100 mr-2 ml-1">
              <FolderIcon className="m-2 h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            {titleChanging ? (
              <div className="flex mb-2">
                <input
                  value={Title}
                  onChange={(e) => setSubject({ ...subject, Title: e.target.value })}
                  name="Title"
                  type="text"
                  placeholder="Enter the Subject Title"
                  className={`w-60  border rounded-md ${
                    nestedLevel === 0 ? 'text-lg' : 'text-md'
                  } `}
                />
                <div className="ml-1">
                  <button className="border p-1 rounded-md" onClick={() => setTitleChanging(false)}>
                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex mb-2">
                <div className="pt-1.5">{Title.length ? Title : 'No Subject title'}</div>
                <div className="ml-1">
                  <button
                    className="hover:text-indigo-500 p-1 rounded-md"
                    onClick={() => setTitleChanging(true)}>
                    <PencilIcon className="m-1 h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex mt-2 ml-2">
            <button
              disabled={!(components.length > 0)}
              onClick={() => setIsOpen(!isOpen)}
              className="text-left text-sm font-medium rounded-full text-gray-900">
              <ChevronUpIcon
                className={`${!isOpen ? 'rotate-180 transform' : ''} h-5 w-5 ${
                  components.length > 0 ? 'text-gray-600' : 'text-gray-300'
                } `}
              />
            </button>
            <div className="ml-2">Subject</div>
          </div>
        </div>
        <div className="relative">
          <div className="-mr-2 flex absolute right-3">
            <SubjectDropdown dropdownContent={dropdownContent} />
          </div>
        </div>
      </div>
      {components.length > 0 && isOpen && (
        <div className="text-sm bg-gray-50">{components.map((component) => component)}</div>
      )}
    </div>
  );
};

SubjectComponent.propTypes = {
  notifyParent: PropTypes.func.isRequired,
  removeSubject: PropTypes.func.isRequired,
  subjectObject: PropTypes.any.isRequired,
  nestedLevel: PropTypes.number.isRequired,
};

export default SubjectComponent;
