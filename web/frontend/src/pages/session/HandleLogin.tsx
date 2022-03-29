import { ENDPOINT_GET_TEQ_KEY } from 'components/utils/Endpoints';
import { t } from 'i18next';

/*The backend will provide the client the URL to make a Tequila
authentication. We therefore redirect to this address. */
const handleLogin = async (loginError: any, setLoginError: React.Dispatch<any>) => {
  fetch(ENDPOINT_GET_TEQ_KEY)
    .then((resp) => {
      const jsonData = resp.json();
      jsonData.then((result) => {
        window.location = result.url;
      });
    })
    .catch((error) => {
      setLoginError(error);
      console.log(error);
    });

  return <div>{loginError === null ? <div></div> : t('errorServerDown')}</div>;
};

export default handleLogin;
