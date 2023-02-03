import React from 'react';
import styles from './styles.module.css';

function Hero({ heading, subheading, showGraphic = false, customStyles = {}, classNames = '' }) {
  return (
    <header className={` ${styles.Hero} container-fluid ${classNames ? classNames : ''}`} style={customStyles && customStyles}>
      {showGraphic && (
        <div className={styles.showGraphic}></div>
      )}
      <div className={`container`}>
        <div className="row justify-content-center">
          <div className="col col--7">
            <h1>{heading}</h1>
            <p>{subheading}</p>
            <img src="/_vercel/image?url=%2Ftest.png&w=1000&q=75" width="500" height="375" />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Hero;

