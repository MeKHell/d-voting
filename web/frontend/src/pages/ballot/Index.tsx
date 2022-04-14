import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleTable from 'pages/election/components/SimpleTable';
import { OPEN } from 'components/utils/StatusNumber';
import './Index.css';
import { ROUTE_BALLOT_SHOW } from 'Routes';

const BallotIndex: FC = () => {
  const { t } = useTranslation();

  return (
    <div>
      <SimpleTable
        statusToKeep={OPEN}
        pathLink={ROUTE_BALLOT_SHOW}
        textWhenData={t('voteAllowed')}
        textWhenNoData={t('noVote')}
      />
    </div>
  );
};

export default BallotIndex;
