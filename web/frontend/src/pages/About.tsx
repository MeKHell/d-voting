import React, { FC, Fragment } from 'react';
import { useTranslation } from 'react-i18next';

const About: FC = () => {
  const { t } = useTranslation();

  return (
    <Fragment>
      <div className="w-[60rem] font-sans px-4 py-4">
        <div>
          <br />
          {t('about1')}
          <br />
          <br />
          {t('about2')}
          <br />
          <br />
          {t('about3')}
          <br />
          <br />
          {t('about4')}
          <br />
        </div>
      </div>
    </Fragment>
  );
};

export default About;
