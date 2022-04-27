import { FC } from 'react';

type TextButtonProps = {
  children: string;
};

// A button with text
const TextButton: FC<TextButtonProps> = ({ children }) => {
  return (
    <button
      type="button"
      className="text-gray-700 my-2 mx-2 items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm shadow-md font-medium hover:text-white hover:bg-indigo-500">
      {children}
    </button>
  );
};

export default TextButton;
