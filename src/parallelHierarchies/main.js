import * as d3 from 'd3';

import HierarchiesComponent from './parallelHierarchies';
import UIComponent from './ui';
import CustomSchemaLoader from './data/customSchemaLoader';
import DataProvider from './data/dataProvider';
import EventMediator from './eventMediator';

export const COLORS = ['#77AADD', '#77CCCC', '#88CCAA', '#DDDD77', '#DDAA77', '#DD7788', '#CC99BB'];

const svg = d3.select('#parallelHierarchies');

export default class ParallelHierarchiesModule {
  constructor() {
    this.dataProvider = {};
    this.configurations = {};
    this.activeConfiguration = null;
    this.hierarchiesComponent = null;
    this.uiComponent = null;
    this.isBottomNavVisible = false;
    this.isViewRotated = false;

    this.schemaLoader = this.getSchemaLoaderInstance();
    this.setupEventListeners();
  }

  setConfigurations(configurations) {
    this.configurations = configurations;
    this.addPresetDatasetButtons();
    this.setupEventListeners();
  }

  /**
   * Takes the 'activeConfiguration' property and launches the parallel hierarchies application
   * accordin to it. If the two parameters presetSchema and presetItemList are provided, the data is
   * not loaded from the server but instead build from the data the user provided.
   * @return {void}
   */
  run() {
    if (Object.keys(this.configurations).length === 0) return;

    const WIDTH = Math.max(window.innerWidth - 20, 500);
    const HEIGHT = Math.max(window.innerHeight - 200, 500);

    svg
      .attr('width', WIDTH)
      .attr('height', HEIGHT);

    this.dataProvider = new DataProvider();
    this.dataProvider.itemID = 'ID';

    this.hierarchiesComponent = this.getHierarchiesComponentInstance()
      .isRotated(this.isViewRotated)
      .width(this.isViewRotated ? HEIGHT : WIDTH)
      .height(this.isViewRotated ? WIDTH : HEIGHT);

    const schemaIsUndefined = this.activeConfiguration.presetSchema != null;
    const presetListIsUndefined = this.activeConfiguration.presetItemList != null;

    // do not load the schema and itemlist from the server, but from disk if a custom schema was
    // provided
    if (schemaIsUndefined && presetListIsUndefined) {
      this.loadUserSchema();
    } else {
      this.loadPreset();
    }

    this.uiComponent = this.getUIComponentInstance();
    this.uiComponent.rulerLength = WIDTH - 20;

    this.uiComponent.setCategoryInteraction('drag');

    this.hierarchiesComponent.ui(this.uiComponent);

    svg.call(this.hierarchiesComponent);
    d3.select('#datasetModal').classed('hidden', true);
  }

  loadPreset() {
    this.dataProvider.itemFile = this.activeConfiguration.itemURI;
    this.dataProvider.schemaFile = this.activeConfiguration.schemaURI;

    if (this.activeConfiguration.initialDimensions) {
      this.hierarchiesComponent.initialDimensions(this.activeConfiguration.initialDimensions);
    }
  }

  loadUserSchema() {
    // FIXME: dataProvider deletes aggregate dimension on load, so its not available in the
    // items anymore when resetting the application. We therefore add the aggregate dimension
    // again to allow resetting.
    this.schemaLoader.schema.timestamps.forEach((dimension) => {
      this.schemaLoader.itemList.forEach((item) => {
        if (item.aggregateDimensions) { item[dimension] = item.aggregateDimensions[dimension]; }
      });
    });

    this.dataProvider.setSchemaFromJson(this.schemaLoader.schema);
    this.dataProvider.setItemListFromCSV(this.schemaLoader.itemList);
  }

  /**
   * Takes the provided hierarchies and itemfile and loads them into the application,
   * afterwards runActiveconfiguration is run by callback in mySchemaLoader.
   * @return {void}
   */
  runUserSchema() {
    const aggregate = d3.select('#userAggregateValue').node().value.trim();

    if (d3.select('#userItems').node().files.length === 0) {
      d3.select('#userSchemaError').classed('hidden', false).text('CSV File not set');
      return;
    } else if (aggregate.length === 0) {
      d3.select('#userSchemaError').classed('hidden', false).text('Aggregate Dimension must be set');
      return;
    }

    this.activeConfiguration = null;
    this.schemaLoader.setAggregateDimension(aggregate);
    this.schemaLoader.loadSchemaAndItems();

    d3.select('#userSchemaError').classed('hidden', true);
  }

  getHierarchiesComponentInstance() {
    return new HierarchiesComponent()
      .color(d3.scaleOrdinal().range(COLORS))
      .dataProvider(this.dataProvider);
  }

  getSchemaLoaderInstance() {
    return new CustomSchemaLoader()
      .itemsFileInput(d3.select('#userItems').node())
      .onLoadEnd(() => {
        this.activeConfiguration = {};
        this.activeConfiguration.presetSchema = this.schemaLoader.schema;
        this.activeConfiguration.presetItemList = this.schemaLoader.itemList;
        this.run();
      });
  }

  getUIComponentInstance() {
    const component = new UIComponent();
    component.hierarchies = this.hierarchiesComponent;
    component.dropDownMenu = d3.select('select#dimensionPicker');
    component.tooltip = d3.select('#tooltip');
    component.useDarkTheme = false;
    component.title = d3.select('nav > h1');
    component.percentageBarSelection = d3.select('div#percentageBars');
    component.ribbonUncertaintySelection = d3.select('#ribbonUncertaintyModePicker');
    component.categoryUncertaintySelection = d3.select('#categoryUncertaintyModePicker');
    component.categoryComparisonSelection = d3.select('#categoryComparisonModePicker');
    component.uncertaintyColorSchemeSelection = d3.select('#uncertaintyColorSchemePicker');
    component.downloadSVGButton = d3.select('#SVGDownload');
    component.downloadPNGButton = d3.select('#PNGDownload');
    component.downloadPDFButton = d3.select('#PDFDownload');
    component.init();

    return component;
  }

  /**
   * Update the width, height and rotation of the application when the window is resized.
   * @return {void}
   */
  resizeApplication() {
    const WIDTH = Math.max(window.innerWidth - 20, 500);
    const HEIGHT = Math.max(window.innerHeight - 200, 500);

    d3.select('svg#parallelHierarchies')
      .attr('width', WIDTH)
      .attr('height', HEIGHT);

    if (this.hierarchiesComponent != null) {
      this.hierarchiesComponent
        .isRotated(this.isViewRotated)
        .width(this.isViewRotated ? HEIGHT : WIDTH)
        .height(this.isViewRotated ? WIDTH : HEIGHT);

      EventMediator.notify('resize');
    }
  }

  /**
   * Takes the clicked-on preset and sets it as activeConfiguration, then launches the application
   * @return {void}
   */
  pickPresetConfiguration() {
    let presetName = d3.event.target.parentNode.value;

    if (d3.event.target.className === 'preset') presetName = d3.event.target.value;

    this.activeConfiguration = this.configurations[presetName];
    this.run();
  }

  /**
   * Reads the inputs for hierarchy label and levels and adds a new hierarchy to the user-defined
   * schema.
   * @return {void}
   */
  addUserHierarchyToSchemaAndView() {
    const label = d3.select('#userHierarchyLabel').node().value.trim();
    const levels = d3.select('#userHierarchyLevels').node().value.split(',').map(s => s.trim());

    // label is a string, levels is an array (if input is empty, levels is still [''] due to
    // split())
    if (label.length === 0) {
      d3.select('#userSchemaError').classed('hidden', false).text('Label must be set');
      return;
    } else if (levels.length === 1 && levels[0] === '') {
      d3.select('#userSchemaError').classed('hidden', false).text('Levels must not be empty');
      return;
    }

    this.schemaLoader.addUserHierarchy(label, levels);

    // DOM representation for the hierarchy.
    const entry = d3.select('#userHierarchies').append('li');
    entry.append('strong').attr('class', 'label').text(label);
    entry.append('span').attr('class', 'levels').text(levels.join(' > '));
    entry.append('button').attr('class', 'delete_level').text('remove').on('click', function() {
      this.schemaLoader.removeUserHierarchy(label);
      d3.select(this.parentNode).remove();
    });

    d3.select('#userHierarchyLabel').node().value = '';
    d3.select('#userHierarchyLevels').node().value = '';
    d3.select('#userSchemaError').classed('hidden', true);
  }

  addPresetDatasetButtons() {
    const list = d3.select('ul#presetDatasets');
    list.selectAll('li').remove();
    const buttons = list.selectAll('li').data(Object.keys(this.configurations)).enter()
      .append('li')
      .append('button')
      .attr('class', 'preset')
      .attr('value', d => d);

    buttons.append('i').attr('class', 'material-icons').text('folder_open');
    buttons.append('span').text(d => d);

    const custom = list.append('li').append('button');
    custom.attr('id', 'toggleCustom').attr('class', 'preset custom');
    custom.append('i').attr('class', 'material-icons').text('build');
    custom.append('span').text('Use your own Dataset');
  }

  setupEventListeners() {
    // bind complex functions from above to listeners
    d3.select(window)
      .on('resize', () => this.resizeApplication());

    d3.select('#reset')
      .on('click', () => this.run());
    d3.select('#addUserHierarchyButton')
      .on('click', () => this.addUserHierarchyToSchemaAndView());
    d3.select('#datasetModal').selectAll('li button.preset')
      .on('click', () => this.pickPresetConfiguration());

    d3.select('#addRuler')
      .on('click', () => this.uiComponent.addRuler());
    d3.select('#toggleDarkTheme')
      .on('click', () => this.uiComponent.toggleTheme());

    d3.select('#showBottomNav')
      .classed('hidden', false)
      .on('click', function() {
        d3.select(this).classed('hidden', true);
        d3.select('#uiControls').classed('hidden', false);
        d3.select('#hideBottomNav').classed('hidden', false);
      });
    d3.select('#hideBottomNav')
      .classed('hidden', true)
      .on('click', function() {
        d3.select(this).classed('hidden', true);
        d3.select('#uiControls').classed('hidden', true);
        d3.select('#showBottomNav').classed('hidden', false);
      });
    d3.select('#uiControls').classed('hidden', true);

    // switch between dragging and fisheye interaction mode
    d3.selectAll('#fisheyeRadio,#draggingRadio').on('change', () => {
      this.uiComponent.setCategoryInteraction(d3.event.target.value);
    });

    d3.select('input#acordionToggle')
      .on('change', () => {
        this.hierarchiesComponent.useZoomableDimensions(d3.event.target.checked);
      });

    d3.select('input#acordionToggle').node().checked = false;

    // show the dataset modal view to change the current dataset
    d3.select('button#swapDataset').on('click', () => {
      d3.select('#datasetModal').classed('hidden', false);
    });

    // hide the dataset modal
    d3.select('#datasetModal div.hide').on('click', () => {
      d3.select('#datasetModal').classed('hidden', true);
    });

    // toggle the region for user-defined datasets and schemas in the dataset modal
    d3.select('#datasetModal li button#toggleCustom').on('click', () => {
      d3.select('#ownDataset').classed('hidden', !d3.select('#ownDataset').classed('hidden'));
      d3.select('#datasetModal').classed('centred', !d3.select('#datasetModal').classed('centred'));
    });

    d3.select('#userSchemaStart').on('click', () => this.runUserSchema());

    // d3.select('#optimizeIntersections')
    //   .on('click', () => this.hierarchiesComponent.optimizeIntersections());
    d3.select('#toggleIntersectionMinimization')
      .on('change', () => {
        this.hierarchiesComponent.useIntersectionMinimization(d3.event.target.checked);
      });
    d3.select('#toggleGreedyMinimization')
      .on('change', () => {
        this.hierarchiesComponent.useGreedyOptimization(d3.event.target.checked);
      });
    d3.select('#optimizeIntersections')
      .on('click', () => this.hierarchiesComponent.optimizeIntersections());

    d3.select('#rotateView').on('click', () => {
      this.isViewRotated = !this.isViewRotated;
      this.resizeApplication();

      EventMediator.notify('rotateView');
    });
  }
}

