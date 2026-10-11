export function Footer({ store }) {
  return (
    <div className="foot">
      <p>
        Questions? Reply to this email or visit <a href={store.helpUrl}>our help centre</a>.
      </p>
      {store.code === "uk" ? (
        <p>Fernwood Supply Ltd, 14 Canal Street, Manchester M1 3HE, United Kingdom</p>
      ) : store.code === "eu" ? (
        <p>Fernwood Supply B.V., Herengracht 210, 1016 BS Amsterdam, Netherlands</p>
      ) : (
        <p>Fernwood Supply Inc., 820 SE Alder St, Portland, OR 97214, USA</p>
      )}
      <p>
        <a href={store.unsubscribeUrl}>Email preferences</a>
      </p>
    </div>
  );
}
